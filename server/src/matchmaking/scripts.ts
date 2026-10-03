// These scripts use one Redis namespace and run atomically. Dynamic keys require
// a single Redis primary; cluster sharding needs a different key strategy.
const helpers = `
local sid = ARGV[1]
local owner = ARGV[2]
local function session(id) return 'cr:session:' .. id end
local function lease(id) return 'cr:lease:' .. id end
local function current(id) return 'cr:current:' .. id end
local function match(id) return 'cr:match:' .. id end
local function witness(id, mid) return 'cr:witness:' .. id .. ':' .. mid end
local function validOwner()
  return redis.call('EXISTS', session(sid)) == 1 and redis.call('GET', lease(sid)) == owner
end
local function endMatch(id)
  local raw = redis.call('GET', match(id))
  if not raw then
    if redis.call('GET', current(sid)) == id then redis.call('DEL', current(sid)) end
    return nil
  end
  local data = cjson.decode(raw)
  if data.a ~= sid and data.b ~= sid then return nil end
  local peer = data.a == sid and data.b or data.a
  local peerOwner = redis.call('GET', lease(peer)) or ''
  if redis.call('GET', current(sid)) == id then redis.call('DEL', current(sid)) end
  if redis.call('GET', current(peer)) == id then redis.call('DEL', current(peer)) end
  redis.call('DEL', match(id))
  return {id, peer, peerOwner}
end
`;

export const CLAIM_OWNER =
  helpers +
  `
if redis.call('EXISTS', session(sid)) == 0 then return {'ERR', 'SESSION_EXPIRED'} end
local ttl = math.min(60000, redis.call('PTTL', session(sid)))
if ttl <= 0 then return {'ERR', 'SESSION_EXPIRED'} end
if not redis.call('SET', lease(sid), owner, 'NX', 'PX', ttl) then return {'ERR', 'SESSION_IN_USE'} end
redis.call('ZREM', 'cr:queue', sid)
local previous = redis.call('GET', current(sid))
local ended = previous and endMatch(previous) or nil
return {'OK', ended or {}}
`;

export const HEARTBEAT =
  helpers +
  `
if not validOwner() then return {'ERR', 'SESSION_EXPIRED'} end
local ttl = math.min(60000, redis.call('PTTL', session(sid)))
if ttl <= 0 then return {'ERR', 'SESSION_EXPIRED'} end
redis.call('PEXPIRE', lease(sid), ttl)
local id = redis.call('GET', current(sid))
if not id then return {'OK', {}} end
local raw = redis.call('GET', match(id))
if not raw then redis.call('DEL', current(sid)); return {'OK', {id, '', ''}} end
local data = cjson.decode(raw)
local peer = data.a == sid and data.b or data.a
if redis.call('EXISTS', lease(peer)) == 0 or redis.call('EXISTS', session(peer)) == 0 or redis.call('GET', current(peer)) ~= id then
  return {'OK', endMatch(id) or {id, '', ''}}
end
redis.call('EXPIRE', witness(sid, id), 900)
redis.call('EXPIRE', witness(peer, id), 900)
return {'OK', {}}
`;

export const JOIN_QUEUE =
  helpers +
  `
if not validOwner() then return {'ERR', 'SESSION_EXPIRED'} end
local existing = redis.call('GET', current(sid))
if existing and redis.call('EXISTS', match(existing)) == 1 then return {'ERR', 'ALREADY_MATCHED'} end
if existing then redis.call('DEL', current(sid)) end
local candidates = redis.call('ZRANGE', 'cr:queue', 0, 999)
local start = #candidates > 0 and math.random(1, #candidates) or 1
for offset = 0, #candidates - 1 do
  local peer = candidates[((start + offset - 1) % #candidates) + 1]
  local peerOwner = redis.call('GET', lease(peer))
  local raw = redis.call('GET', session(peer))
  if not peerOwner or not raw or redis.call('EXISTS', current(peer)) == 1 then
    redis.call('ZREM', 'cr:queue', peer)
  elseif peer ~= sid and redis.call('EXISTS', 'cr:block:' .. sid .. ':' .. peer) == 0 and redis.call('EXISTS', 'cr:block:' .. peer .. ':' .. sid) == 0 then
    local ttl = math.min(redis.call('PTTL', session(sid)), redis.call('PTTL', session(peer)))
    if ttl > 0 then
      local id = ARGV[3]
      local selfData = cjson.decode(redis.call('GET', session(sid)))
      local peerData = cjson.decode(raw)
      redis.call('ZREM', 'cr:queue', sid, peer)
      redis.call('SET', match(id), cjson.encode({id=id, a=peer, b=sid}), 'PX', ttl)
      redis.call('SET', current(sid), id, 'PX', ttl)
      redis.call('SET', current(peer), id, 'PX', ttl)
      redis.call('SET', witness(sid, id), cjson.encode({peerId=peer, peerRef=peerData.sessionRef}), 'EX', 900)
      redis.call('SET', witness(peer, id), cjson.encode({peerId=sid, peerRef=selfData.sessionRef}), 'EX', 900)
      return {'MATCH', id, peer, peerOwner}
    end
  end
end
if redis.call('ZSCORE', 'cr:queue', sid) then return {'WAITING'} end
if redis.call('ZCARD', 'cr:queue') >= 1000 then return {'ERR', 'QUEUE_FULL'} end
redis.call('ZADD', 'cr:queue', ARGV[4], sid)
redis.call('EXPIRE', 'cr:queue', 86400)
return {'WAITING'}
`;

export const LEAVE_MATCH =
  helpers +
  `
if not validOwner() then return {'ERR', 'SESSION_EXPIRED'} end
local id = redis.call('GET', current(sid))
if ARGV[3] ~= '' and id ~= ARGV[3] then return {'ERR', 'MATCH_ENDED'} end
redis.call('ZREM', 'cr:queue', sid)
return {'OK', id and endMatch(id) or {}}
`;

export const DISCONNECT =
  helpers +
  `
if redis.call('GET', lease(sid)) ~= owner then return {'OK', {}} end
redis.call('DEL', lease(sid))
redis.call('ZREM', 'cr:queue', sid)
local id = redis.call('GET', current(sid))
return {'OK', id and endMatch(id) or {}}
`;

export const CURRENT_PEER =
  helpers +
  `
if not validOwner() then return {'ERR', 'SESSION_EXPIRED'} end
local id = redis.call('GET', current(sid))
if id ~= ARGV[3] then return {'ERR', 'MATCH_ENDED'} end
local raw = redis.call('GET', match(id))
if not raw then return {'ERR', 'MATCH_ENDED'} end
local data = cjson.decode(raw)
if data.a ~= sid and data.b ~= sid then return {'ERR', 'MATCH_ENDED'} end
local peer = data.a == sid and data.b or data.a
local peerOwner = redis.call('GET', lease(peer))
if not peerOwner or redis.call('EXISTS', session(peer)) == 0 or redis.call('GET', current(peer)) ~= id then return {'ERR', 'MATCH_ENDED'} end
if redis.call('EXISTS', 'cr:block:' .. sid .. ':' .. peer) == 1 or redis.call('EXISTS', 'cr:block:' .. peer .. ':' .. sid) == 1 then return {'ERR', 'MATCH_ENDED'} end
return {'OK', peer, peerOwner, data.a == sid and '1' or '0'}
`;

export const RECENT_PEER =
  helpers +
  `
if not validOwner() then return {'ERR', 'SESSION_EXPIRED'} end
local raw = redis.call('GET', witness(sid, ARGV[3]))
if not raw then return {'ERR', 'MATCH_ENDED'} end
return {'OK', raw}
`;

export const BLOCK_PEER =
  helpers +
  `
if not validOwner() then return {'ERR', 'SESSION_EXPIRED'} end
local id = ARGV[3]
local raw = redis.call('GET', witness(sid, id))
if not raw then return {'ERR', 'MATCH_ENDED'} end
local peer = cjson.decode(raw).peerId
local ttl = redis.call('PTTL', session(sid))
if ttl <= 0 then return {'ERR', 'SESSION_EXPIRED'} end
redis.call('SET', 'cr:block:' .. sid .. ':' .. peer, '1', 'PX', ttl)
redis.call('SET', 'cr:block:' .. peer .. ':' .. sid, '1', 'PX', ttl)
local active = redis.call('GET', current(sid))
if active then
  local activeRaw = redis.call('GET', match(active))
  if activeRaw then
    local activeData = cjson.decode(activeRaw)
    if (activeData.a == sid and activeData.b == peer) or (activeData.b == sid and activeData.a == peer) then
      return {'OK', endMatch(active) or {}}
    end
  end
end
return {'OK', {}}
`;

export const PRUNE_QUEUE = `
local candidates = redis.call('ZRANGE', 'cr:queue', 0, 999)
local count = 0
for _, id in ipairs(candidates) do
 if redis.call('EXISTS', 'cr:lease:' .. id) == 0 or redis.call('EXISTS', 'cr:session:' .. id) == 0 or redis.call('EXISTS', 'cr:current:' .. id) == 1 then
   count = count + redis.call('ZREM', 'cr:queue', id)
 end
end
return count
`;

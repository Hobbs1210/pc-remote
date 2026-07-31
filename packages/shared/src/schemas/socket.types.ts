import { HeartbeatPayload, LocalUsersPayload } from './device.js'
import { CommandResult, CommandPayload } from './command.js'
import { WeeklySchedule } from './schedule.js'
import { WS_EVENTS } from '../constants/events.js'

export interface AgentToServerEvents {
  [WS_EVENTS.AGENT_HEARTBEAT]: (payload: HeartbeatPayload) => void
  [WS_EVENTS.AGENT_COMMAND_RESULT]: (payload: CommandResult) => void
  [WS_EVENTS.AGENT_LOCAL_USERS]: (payload: LocalUsersPayload) => void
  [WS_EVENTS.AGENT_SCREENSHOT]: (payload: { image: string }) => void
  [WS_EVENTS.AGENT_BIND_REQUEST]: (payload: { secret: string; deviceId: string }) => void
}

export interface ServerToAgentEvents {
  [WS_EVENTS.SERVER_COMMAND]: (payload: { commandId: string; type: string; payload?: CommandPayload }) => void
  [WS_EVENTS.SERVER_SCHEDULE_UPDATE]: (payload: WeeklySchedule) => void
  [WS_EVENTS.SERVER_BONUS_UPDATE]: (payload: { bonusMinutes: number }) => void
  [WS_EVENTS.SERVER_UNBIND]: (payload: { deviceId: string }) => void
  [WS_EVENTS.SERVER_BIND_SUCCESS]: (payload: { agentToken: string }) => void
}

export interface InterServerEvents {
  ping: () => void
}

export interface SocketData {
  deviceId: string
  agentVersion: string
}

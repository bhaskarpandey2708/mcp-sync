export {
  appDataDir,
  denormalizeEntry,
  getClients,
  loadClientState,
  normalizeEntry,
  parseServers,
  renderDoc,
} from "./clients.js";
export {
  applyPlan,
  applyPlans,
  backupFile,
  canonical,
  diffAll,
  listBackups,
  mapsEqual,
  planSync,
  restoreBackup,
  serversEqual,
  validateStates,
  writeBackupManifest,
} from "./core.js";
export {
  acquireLock,
  atomicWriteFile,
  backupStamp,
  backupsDir,
  lockPath,
  stateDir,
} from "./fsutil.js";
export type {
  ApplyResult,
  ClientDef,
  ClientState,
  McpServer,
  ServerMap,
  SyncOptions,
  SyncPlan,
  TransportType,
  ValidationIssue,
} from "./types.js";
export type { BackupStampInfo, DiffRow, RestoreOptions, RestoreResult } from "./core.js";

// Redis service
export {
  getRedis,
  initRedis,
  closeRedis,
  createCLISession,
  getCLISession,
  completeCLISession,
  deleteCLISession,
  checkRateLimit,
  getCache,
  setCache,
  deleteCache,
  incrementAPIStats,
  getAPIStats,
} from "./redis.service.js";

// Blockchain service
export {
  getUSDCBalance,
  getETHBalance,
  isAuthorizationUsed,
  getTransactionReceipt,
  waitForTransaction,
  getBlockNumber,
  getBlockTimestamp,
  verifySignature,
  parseUSDC,
  formatUSDC,
  createPlatformWallet,
  getChainInfo,
  publicClient,
} from "./blockchain.service.js";

// Payment service
export {
  verifyX402Payment,
  recordPayment,
  updateUsageWithPayment,
  getPendingPayments,
  getPublisherPaymentStats,
  calculatePlatformFee,
  calculateNetAmount,
} from "./payment.service.js";

// Settlement service
export {
  settleApiPayments,
  settlePublisherPayments,
  processWithdrawal,
  getSettlementSummary,
  runPeriodicSettlement,
} from "./settlement.service.js";

// Health service
export {
  getHealthStatus,
  checkAPIHealth,
  updateAPIHealthStatus,
  runAPIHealthChecks,
  isAlive,
  isReady,
} from "./health.service.js";

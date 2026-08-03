import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Append-only wallet ledger. `txnId` is unique → idempotency: a retried
 * aggregator call (same txnId) can never apply twice.
 *  - bet/win/rollback txnId = aggregator transaction id
 *  - rollback uses `${betTxnId}:rb`
 *  - deposit uses an internally generated id
 */
const walletTxnSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    txnId: { type: String, required: true, unique: true },
    type: { type: String, enum: ['bet', 'win', 'rollback', 'deposit', 'withdraw'], required: true },
    amount: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
    balanceAfter: { type: Number, default: null },
    roundId: { type: String, default: null },
    gameCode: { type: String, default: null },
    refOf: { type: String, default: null },
  },
  { timestamps: true }
);

walletTxnSchema.index({ userId: 1, createdAt: -1 });

const WalletTransaction = mongoose.model('WalletTransaction', walletTxnSchema);
export default WalletTransaction;

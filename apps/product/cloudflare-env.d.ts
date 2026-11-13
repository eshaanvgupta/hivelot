declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    HIVELOT_PROTOCOL_ADDRESS?: string;
    SETTLEMENT_TOKEN_ADDRESS?: string;
    LOCAL_QIE_RPC_URL?: string;
  }
}

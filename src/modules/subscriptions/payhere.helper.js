import crypto from "crypto";

/**
 * Generate a PayHere payment hash.
 * Formula: MD5(merchant_id + order_id + amount_2dp + currency + MD5(merchant_secret).toUpperCase()).toUpperCase()
 */
export function generatePayHereHash(merchantId, orderId, amount, currency, merchantSecret) {
  const amountFormatted = parseFloat(amount).toFixed(2);
  const secretMd5 = crypto.createHash("md5").update(merchantSecret).digest("hex").toUpperCase();
  const raw = `${merchantId}${orderId}${amountFormatted}${currency}${secretMd5}`;
  return crypto.createHash("md5").update(raw).digest("hex").toUpperCase();
}

/**
 * Verify a PayHere notify POST request.
 * Formula: MD5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + MD5(merchant_secret).toUpperCase()).toUpperCase()
 */
export function verifyPayHereNotify(merchantId, orderId, amount, currency, statusCode, md5sig, merchantSecret) {
  const secretMd5 = crypto.createHash("md5").update(merchantSecret).digest("hex").toUpperCase();
  const raw = `${merchantId}${orderId}${amount}${currency}${statusCode}${secretMd5}`;
  const expected = crypto.createHash("md5").update(raw).digest("hex").toUpperCase();
  return expected === md5sig?.toUpperCase();
}

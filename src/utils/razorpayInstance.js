import Razorpay from "razorpay";

let razorpayInstance = null;

export const getRazorpayInstance = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
  }

  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  return razorpayInstance;
};

/**
 * SDK has no plans.delete — rollback orphan plans via REST when DB insert fails.
 * @see https://razorpay.com/docs/api/plans/#delete-a-plan
 */
export const deleteRazorpayPlan = async (planId) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(
    `https://api.razorpay.com/v1/plans/${encodeURIComponent(planId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Razorpay DELETE plan failed: ${res.status} ${body}`);
  }
};
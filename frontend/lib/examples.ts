// Illustrative examples written by the SafeCircle team for demonstration.
// They are not real messages and contain no real phone numbers or links.
export const EXAMPLES: { label: string; kind: "message" | "url"; text: string }[] = [
  { label: "Bank KYC + OTP scam", kind: "message",
    text: "Dear Customer, your SBI account will be BLOCKED today. Update your KYC immediately at http://sbi-kyc-verify.top/login and share the OTP you receive to confirm." },
  { label: "'Hi Mum' new number", kind: "message",
    text: "Hi Mum, this is my new number, I dropped my phone. Can you transfer 18,500 to my friend's account urgently? I'll explain later. Please don't tell Dad." },
  { label: "Delivery fee + link", kind: "message",
    text: "India Post: your parcel is held at customs. Pay the redelivery fee of Rs 25 within 24 hours or it will be returned: bit.ly/ip-redeliver" },
  { label: "Fake tech support", kind: "message",
    text: "Microsoft Security Alert: your computer is infected. Call our technician and install AnyDesk so we can remove the virus. Do not turn off your computer." },
  { label: "Genuine OTP message", kind: "message",
    text: "482913 is your OTP for login. Do not share it with anyone. Bank staff will never ask for your OTP." },
  { label: "Everyday message", kind: "message", text: "Running 10 minutes late, order me a coffee? See you at the cafe." },
  { label: "Look-alike link", kind: "url", text: "https://paypal.com.account-verify-secure.top/webscr?cmd=login" },
  { label: "Official link", kind: "url", text: "https://www.paypal.com/signin" },
];

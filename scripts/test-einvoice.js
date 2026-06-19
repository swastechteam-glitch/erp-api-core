// ---------------------------------------------------------------------------
// Manual E-Invoice tester — exercises the GSP directly (no HTTP / no JWT).
//
//   node scripts/test-einvoice.js              -> AUTH ONLY (safe, no invoice)
//   node scripts/test-einvoice.js --generate   -> AUTH + generate a REAL IRN
//
// ⚠️  --generate hits the PRODUCTION GSP and creates a real e-invoice for the
//     configured GSTIN. Only run it when you intend to. Edit SAMPLE below to
//     use a valid, active buyer GSTIN.
// ---------------------------------------------------------------------------

import {
  authenticate,
  buildNicPayload,
  generateEInvoice,
  normalizeResponse,
} from "../src/services/einvoice.service.js";

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// Inter-state sample (TN seller 33 -> Telangana buyer 36 => IGST).
const SAMPLE = {
  transaction: { supplyType: "B2B", regRev: "N", igstOnIntra: "N" },
  document: { type: "INV", no: "INV/TEST/001", date: today() },
  seller: {
    gstin: "33AABCT1285C2ZR",
    legalName: "SWASTECH SOFTWARE RICE PROWIN PVT LTD",
    tradeName: "SWASTECH",
    address1: "No 1 Main Road",
    location: "Coimbatore",
    pincode: "641001",
    stateCode: "33",
    phone: "9000000000",
    email: "test@skyrpit.com",
  },
  buyer: {
    gstin: "36AABCT1332L011", // <-- replace with a real active GSTIN before generating
    legalName: "Test Buyer Pvt Ltd",
    tradeName: "Test Buyer",
    pos: "36",
    address1: "Plot 12 Industrial Area",
    location: "Hyderabad",
    pincode: "500001",
    stateCode: "36",
  },
  items: [
    {
      slNo: 1,
      productName: "Rice Bag 25kg",
      isService: false,
      hsnCode: "1006",
      qty: 10,
      unit: "BAG",
      unitPrice: 1000,
      totalAmount: 10000,
      discount: 0,
      assessableValue: 10000,
      gstRate: 5,
      igstAmount: 500,
      cgstAmount: 0,
      sgstAmount: 0,
      totalItemValue: 10500,
    },
  ],
  value: {
    assessableValue: 10000,
    cgstValue: 0,
    sgstValue: 0,
    igstValue: 500,
    discount: 0,
    otherCharges: 0,
    roundOff: 0,
    totalInvoiceValue: 10500,
  },
};

const run = async () => {
  console.log("1) Authenticating to GSTRobo…");
  const token = await authenticate(true);
  console.log("   ✅ AuthToken received:", token.slice(0, 18) + "…");

  if (!process.argv.includes("--generate")) {
    console.log("\nAuth-only test passed. Re-run with --generate to create a real IRN.");
    return;
  }

  console.log("\n2) Generating e-invoice (PRODUCTION — real IRN)…");
  const payload = buildNicPayload(SAMPLE);
  console.log("   Payload:\n", JSON.stringify(payload, null, 2));

  const reply = await generateEInvoice(payload);
  const result = normalizeResponse(reply);
  console.log("\n   Raw GSP reply:\n", JSON.stringify(reply, null, 2));
  console.log("\n   Normalized:");
  console.log("   success:", result.success);
  console.log("   IRN    :", result.irn);
  console.log("   AckNo  :", result.ackNo);
  console.log("   AckDt  :", result.ackDt);
  if (!result.success) console.log("   error  :", result.message, result.errors);
};

run().catch((e) => {
  console.error("\n❌ Test failed:", e.message);
  process.exit(1);
});

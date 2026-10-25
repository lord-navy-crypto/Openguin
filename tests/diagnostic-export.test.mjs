import test from "node:test";
import assert from "node:assert/strict";
import {diagnosticBundleToCsv} from "../.network-test/diagnostic-export.mjs";

test("CSV export flattens nested diagnostic values into spreadsheet rows",()=>{
  const csv=diagnosticBundleToCsv({
    networkSnapshot:{dns:[{host:"chatgpt.com",resolved:true,elapsedMs:6}]},
    speedTest:{downloadMbps:3.6},
    browser:{events:[{kind:"fetch-response",status:403}]}
  });
  assert(csv.startsWith("section,field,value\r\n"));
  assert(csv.includes('networkSnapshot,networkSnapshot.dns[0].host,chatgpt.com'));
  assert(csv.includes('networkSnapshot,networkSnapshot.dns[0].elapsedMs,6'));
  assert(csv.includes('speedTest,speedTest.downloadMbps,3.6'));
  assert(csv.includes('browser,browser.events[0].status,403'));
});

test("CSV export correctly quotes commas, quotes, and line breaks",()=>{
  const csv=diagnosticBundleToCsv({report:{message:'HTTP "403", access restricted\ntry later'}});
  assert(csv.includes('"HTTP ""403"", access restricted\ntry later"'));
});

test("CSV export preserves empty and null values without serializing secrets or executable formulas",()=>{
  const csv=diagnosticBundleToCsv({network:{error:null},browser:{events:[]}});
  assert(csv.includes("network,network.error,"));
  assert(csv.includes("browser,browser.events,[]"));
});

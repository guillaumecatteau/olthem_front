import { requestJsonAcrossRoots } from "./rest-client.js";

export async function submitFormBuilderEntry({ table, values, process = "" }) {
  return requestJsonAcrossRoots("/olthem/v1/forms/submit", {
    method: "POST",
    body: {
      table,
      values,
      process
    },
    failFastOnClientError: true
  });
}

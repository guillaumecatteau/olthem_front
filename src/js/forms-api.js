import { requestJsonAcrossRoots } from "./rest-client.js";

export async function submitFormBuilderEntry({ table, values, process = "", token = null }) {
  return requestJsonAcrossRoots("/olthem/v1/forms/submit", {
    method: "POST",
    body: {
      table,
      values,
      process
    },
    token,
    failFastOnClientError: true
  });
}

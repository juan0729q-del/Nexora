const origin = "https://developers.cjdropshipping.com";
const apiKey = process.env.CJ_DROPSHIPPING_API_KEY?.trim();

if (!apiKey) {
  console.error(JSON.stringify({ ok: false, stage: "configuration", error: "CJ_DROPSHIPPING_API_KEY is missing" }));
  process.exitCode = 1;
} else {
  const authResponse = await fetch(`${origin}/api2.0/v1/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ apiKey }),
    signal: AbortSignal.timeout(15_000),
  });
  const auth = await authResponse.json().catch(() => null);
  const token = auth?.data?.accessToken;
  const authReport = {
    ok: authResponse.ok && Boolean(token),
    stage: "authentication",
    httpStatus: authResponse.status,
    code: auth?.code,
    result: auth?.result,
    message: auth?.message,
    pointsInfo: auth?.pointsInfo,
    requestId: auth?.requestId,
    accessTokenExpiryDate: auth?.data?.accessTokenExpiryDate,
  };
  console.log(JSON.stringify(authReport));

  if (!authReport.ok) {
    process.exitCode = 1;
  } else {
    const settingsResponse = await fetch(`${origin}/api2.0/v1/setting/get`, {
      headers: { Accept: "application/json", "CJ-Access-Token": token },
      signal: AbortSignal.timeout(15_000),
    });
    const settings = await settingsResponse.json().catch(() => null);
    console.log(JSON.stringify({
      ok: settingsResponse.ok && settings?.result !== false,
      stage: "settings",
      httpStatus: settingsResponse.status,
      code: settings?.code,
      result: settings?.result,
      message: settings?.message,
      pointsInfo: settings?.pointsInfo,
      requestId: settings?.requestId,
    }));
    if (!settingsResponse.ok || settings?.result === false) process.exitCode = 1;
  }
}

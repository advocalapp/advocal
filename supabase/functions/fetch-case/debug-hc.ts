// Debug helper - called internally to trace HC fetch steps (diagnostic only)
export async function debugHcSteps(stateCd: number, courtCode: number, stateNm: string) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0';
  const HC_BASE = 'https://hcservices.ecourts.gov.in/ecourtindiaHC';
  const STT_ENDPOINT = 'https://app-c90by552ew3l-api-DY8MNQoqOnMa.gateway.appmedo.com/v1/audio/transcriptions';

  const steps: Record<string, unknown> = {};

  // Step 1: Session (single page load — same as production flow)
  const pageUrl = `${HC_BASE}/cases/c_index.php?state_cd=${stateCd}&dist_cd=1&court_code=${courtCode}&stateNm=${encodeURIComponent(stateNm)}`;
  const pageRes = await fetch(pageUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  steps.pageStatus = pageRes.status;

  const setCookies: string[] = (pageRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  steps.cookieCount = setCookies.length;
  steps.cookieNames = setCookies.map((c: string) => c.split('=')[0]);

  let hcSessId = '', jsession = '';
  for (const c of setCookies) {
    const hcm = c.match(/HCSERVICES_SESSID=([^;]+)/);
    if (hcm) hcSessId = hcm[1];
    if (c.includes('/ecourtindiaHC') || c.includes('ecourtindiaHC')) {
      const jsm = c.match(/JSESSION=([^;]+)/);
      if (jsm) jsession = jsm[1];
    }
  }
  if (!jsession) {
    for (const c of setCookies) {
      const jsm = c.match(/JSESSION=([^;]+)/);
      if (jsm) { jsession = jsm[1]; break; }
    }
  }
  steps.hcSessId = hcSessId ? hcSessId.slice(0, 8) + '...' : 'MISSING';
  steps.jsession = jsession || 'MISSING';
  if (!hcSessId) { steps.error = 'No HCSERVICES_SESSID cookie'; return steps; }

  // Step 2: Audio
  const html = await pageRes.text();
  const audioMatch = html.match(/securimage_play\.php\?id=([a-f0-9]+)/i);
  steps.audioIdFound = !!audioMatch;
  steps.audioId = audioMatch?.[1] ?? 'not found';
  if (!audioMatch) { steps.error = 'No audio captcha URL in page'; return steps; }

  const cookieHeader = `HCSERVICES_SESSID=${hcSessId}; JSESSION=${jsession}`;
  const audioUrl = `${HC_BASE}/securimage/securimage_play.php?id=${audioMatch[1]}`;
  const audioRes = await fetch(audioUrl, {
    headers: { 'User-Agent': UA, 'Cookie': cookieHeader, 'Referer': pageUrl },
    signal: AbortSignal.timeout(20000),
  });
  steps.audioStatus = audioRes.status;
  steps.audioContentType = audioRes.headers.get('content-type');
  const audioBuffer = await audioRes.arrayBuffer();
  steps.audioSize = audioBuffer.byteLength;
  if (audioBuffer.byteLength < 1000) { steps.error = 'Audio too small'; return steps; }

  // Step 3: Whisper
  const apiKey = Deno.env.get('INTEGRATIONS_API_KEY');
  steps.hasApiKey = !!apiKey;
  if (!apiKey) { steps.error = 'INTEGRATIONS_API_KEY not set'; return steps; }

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'captcha.wav');
  formData.append('response_format', 'verbose_json');
  formData.append('prompt', 'A 3 K 7 2 P 9 X M L');

  const whisperRes = await fetch(STT_ENDPOINT, {
    method: 'POST',
    headers: { 'X-Gateway-Authorization': `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(30000),
  });
  steps.whisperStatus = whisperRes.status;
  if (!whisperRes.ok) { steps.whisperError = await whisperRes.text(); return steps; }

  const json = await whisperRes.json() as { text: string; segments?: Array<{ text: string; start: number; end: number }> };
  steps.whisperText = json.text;
  steps.whisperSegments = json.segments?.map((s) => ({ text: s.text, start: s.start, end: s.end }));

  // Step 4: derive captcha (same logic as solveAudioCaptcha — always lowercase)
  const rawText = json.text ?? '';
  let captcha = '';
  if (json.segments && json.segments.length > 0) {
    const allWords: string[] = [];
    for (const seg of json.segments) allWords.push(...seg.text.trim().split(/\s+/).filter(Boolean));
    const isSingle = allWords.every((w) => /^[A-Za-z0-9]$/.test(w.replace(/[^A-Za-z0-9]/g, '')));
    if (isSingle) captcha = allWords.map((w) => w.replace(/[^A-Za-z0-9]/g, '')).join('');
  }
  if (captcha.length < 4) {
    const wordMap: Record<string, string> = {
      zero:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',
      ay:'A',bee:'B',see:'C',dee:'D',gee:'G',jay:'J',kay:'K',el:'L',em:'M',en:'N',
      pee:'P',ar:'R',tee:'T',you:'U',vee:'V',ex:'X',why:'Y',zee:'Z',zed:'Z',
    };
    captcha = rawText.split(/[\s,.\-;:!?]+/).filter(Boolean).map((t) => {
      const w = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (/^[a-z0-9]$/.test(w)) return w;
      return wordMap[w] ?? '';
    }).join('');
  }
  if (captcha.length < 4) captcha = rawText.replace(/[^A-Za-z0-9]/g, '');
  // HC Securimage is case-sensitive and stores lowercase — always submit lowercase
  const finalCaptcha = captcha.slice(0, 6).toLowerCase();
  steps.derivedCaptcha = finalCaptcha;

  // Step 5: Test submit
  const submitBody = new URLSearchParams({
    action_code: 'showRecords', state_code: String(stateCd),
    dist_code: '1', court_code: String(courtCode),
    case_no: '42915', rgyear: '2024', captcha: finalCaptcha,
  });
  const submitRes = await fetch(`${HC_BASE}/cases/filling_no_qry.php`, {
    method: 'POST',
    headers: {
      'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest', 'Cookie': cookieHeader,
      'Referer': pageUrl,
    },
    body: submitBody.toString(),
    signal: AbortSignal.timeout(20000),
  });
  const submitText = (await submitRes.text()).trim().replace(/^\uFEFF/, '');
  steps.submitStatus = submitRes.status;
  steps.submitResponseRaw = submitText.slice(0, 200);

  return steps;
}

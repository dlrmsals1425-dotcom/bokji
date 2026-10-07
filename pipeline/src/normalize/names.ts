import { normalizeText } from "../../../src/lib/data/text";

/**
 * 명칭 정규화 키 (설계서 5.1).
 * 공백·특수문자 제거, 한자 제거('강릉愛밥상' → '강릉밥상'), 괄호 안 부가설명 분리,
 * 접미어('지원사업', '사업', '서비스', '지원') 정리.
 */
export function nameKey(name: string): string {
  let s = name.normalize("NFC");
  s = s.replace(/[(（[【〔][^)）\]】〕]*[)）\]】〕]/g, ""); // 괄호 부가설명
  s = s.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ""); // 한자
  s = s.replace(/[^0-9A-Za-z가-힣]/g, "");
  s = s.toLowerCase();
  // 접미어를 반복 제거 (예: '노인맞춤돌봄서비스사업' → '노인맞춤돌봄')
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(/(지원사업|사업|서비스|지원)$/u, "");
    if (s === before) break;
  }
  return s || name.replace(/\s+/g, "");
}

/** 괄호 안 부가설명 */
export function nameQualifier(name: string): string | undefined {
  const m = name.match(/[(（]([^)）]+)[)）]/);
  return m ? m[1].trim() : undefined;
}

/** 표시용 이름 정리: 연속 공백, 앞뒤 기호 */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").replace(/^[\s·•\-]+|[\s·•\-]+$/g, "").trim();
}

/** 문장 정리: HTML 엔티티·깨진 기호 글자 정리(normalizeText) 후 줄바꿈·글머리표 정리 */
export function cleanText(s: string | undefined | null): string | undefined {
  if (!s) return undefined;
  const t = normalizeText(s)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*(?:\n[ \t]*)+/g, "\n")
    .trim();
  return t || undefined;
}

/** 기관명 정규화: '보건복지부장관' → '보건복지부' */
export function cleanOrg(s: string | undefined | null): string | undefined {
  if (!s) return undefined;
  const t = s.trim().replace(/(장관|청장|처장|위원장)$/u, "");
  return t || undefined;
}

/** 'www.nhis.or.kr' 처럼 스킴이 빠진 링크를 https 로 보정하고, URL 이 아니면 버린다 */
export function normalizeUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  let t = u.trim().split(/\s+/)[0];
  if (!/^https?:\/\//i.test(t)) {
    if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(t)) t = `https://${t}`;
    else return undefined;
  }
  try { return new URL(t).toString(); } catch { return undefined; }
}


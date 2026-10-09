/**
 * (QA 8차) 원천 데이터에서 '지원대상'과 '지원내용' 칸이 서로 뒤바뀌어 들어온 경우를 바로잡는다.
 * 예: 경기도 청년 면접수당 — 지원대상 칸 '○ 지원내용 : 면접수당 5만원…', 지원내용 칸 '○ 지원대상 : 취업면접에 참여한 … 청년'.
 * 두 칸이 모두 상대 칸의 머리말로 시작하고, 자기 칸의 머리말은 어디에도 없을 때만 맞바꾼다 (글자는 고치지 않음 — 원문 그대로).
 */
const BULLET = "^[\\s○◦·•❍〇ㅇ\\-]*";
const TARGET_HEAD = new RegExp(`${BULLET}(?:지원\\s*대상|신청\\s*대상|대상자?)\\s*[:：]`);
const BENEFIT_HEAD = new RegExp(`${BULLET}(?:지원\\s*내용|지원\\s*금액|급여\\s*내용)\\s*[:：]`);
const TARGET_WORD = /(?:지원|신청)\s*대상\s*[:：]/;
const BENEFIT_WORD = /(?:지원\s*내용|지원\s*금액|급여\s*내용)\s*[:：]/;

export function isSwapped(target?: string, benefit?: string): boolean {
  if (!target || !benefit) return false;
  return BENEFIT_HEAD.test(target) && TARGET_HEAD.test(benefit) && !TARGET_WORD.test(target) && !BENEFIT_WORD.test(benefit);
}

export function fixSwapped<T extends { target?: string; benefit?: string }>(rec: T): T {
  return isSwapped(rec.target, rec.benefit) ? { ...rec, target: rec.benefit, benefit: rec.target } : rec;
}

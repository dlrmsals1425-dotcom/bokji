import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeDeep, normalizeText, textBlocks } from "@/lib/data/text";

describe("normalizeText: HTML 엔티티", () => {
  it("&#13; &#10; &#xD; → 줄바꿈, 빈 줄은 한 줄까지", () => {
    expect(normalizeText("가&#13;나&#10;다&#xD;라")).toBe("가\n나\n다\n라");
    expect(normalizeText("가&#13;&#13;&#13;&#13;나&#13;")).toBe("가\n\n나");
    expect(normalizeText("가\r\n나\r다")).toBe("가\n나\n다");
  });
  it("이름 있는 엔티티·숫자·16진수", () => {
    expect(normalizeText("A &amp; B &lt;C&gt; &quot;D&quot; E&nbsp;F")).toBe('A & B <C> "D" E F');
    expect(normalizeText("&lsquo;주택자금&rsquo; &ldquo;임산물&rdquo; 3&sim;5세 &rarr; 다음")).toBe("‘주택자금’ “임산물” 3~5세 → 다음");
    expect(normalizeText("&#9312; 공무원 &#x2461; 교직원")).toBe("① 공무원 ② 교직원");
    expect(normalizeText("두 번 인코딩&amp;#13;끝")).toBe("두 번 인코딩\n끝");
    expect(normalizeText("모르는 &foo; 엔티티는 그대로")).toBe("모르는 &foo; 엔티티는 그대로");
  });
  it("URL은 &amp;만 풀고 나머지는 건드리지 않음", () => {
    expect(normalizeText("https://www.bokjiro.go.kr/a?x=1&amp;y=2")).toBe("https://www.bokjiro.go.kr/a?x=1&y=2");
  });
});

describe("normalizeText: 깨진 글자", () => {
  it("기호 글꼴(Wingdings) 사용자 영역 글자 → 보통 글자", () => {
    expect(normalizeText("\uf06d 대상부부: 신혼부부")).toBe("○ 대상부부: 신혼부부");
    expect(normalizeText("\uf0fe 지체장애")).toBe("☑ 지체장애");
    expect(normalizeText("\uf0fc 조기난소부전")).toBe("✓ 조기난소부전");
    expect(normalizeText("산지에서 \uf081등록신청 \uf083임산물")).toBe("산지에서 ①등록신청 ③임산물");
    expect(normalizeText("도\uf0a0소매 상인")).toBe("도·소매 상인");
    expect(normalizeText("\uf000기초수급자 자가가구")).toBe("기초수급자 자가가구");
    expect(normalizeText("이메일 (\uf02a a@korea.kr)")).toBe("이메일 (✉ a@korea.kr)");
    expect(normalizeText("알 수 없는 \ue123글자")).toBe("알 수 없는 글자");
  });
  it("제어문자·소프트 하이픈·BOM·폭 없는 공백·U+FFFD 지움", () => {
    expect(normalizeText("종사자\u001e")).toBe("종사자");
    expect(normalizeText("-\u00ad 신생아")).toBe("- 신생아");
    expect(normalizeText("\ufeff가\u200b나\ufffd다\u0007")).toBe("가나다");
    expect(normalizeText("가\u009e나")).toBe("가나");
  });
  it("원본이 '?'로 보낸 가운뎃점·글머리표 (한글 사이만)", () => {
    expect(normalizeText("중?고등학생")).toBe("중·고등학생");
    expect(normalizeText("직계 존？비속")).toBe("직계 존·비속");
    expect(normalizeText("초˚중˚고 학생")).toBe("초·중·고 학생");
    expect(normalizeText("?혼인신고 10년 이내")).toBe("• 혼인신고 10년 이내");
    expect(normalizeText("이내 ?구입: 6억")).toBe("이내 • 구입: 6억");
    // 진짜 물음표는 그대로
    expect(normalizeText("받을 수 있나요? 네")).toBe("받을 수 있나요? 네");
    expect(normalizeText("https://a.go.kr/가?나=1")).toBe("https://a.go.kr/가?나=1");
  });
  it("글꼴에 없을 수 있는 가운뎃점 변형 → '·', 정상 글자는 그대로", () => {
    expect(normalizeText("형제･자매 학・석사 임신‧출산 국빈․외교 보편적⸱실질적")).toBe("형제·자매 학·석사 임신·출산 국빈·외교 보편적·실질적");
    expect(normalizeText("⦁ 대회인정기간")).toBe("• 대회인정기간");
    expect(normalizeText("「학교 밖 청소년 지원에 관한 법률」 ※ 참고 ① ❶ ☎ 054 ㎡")).toBe("「학교 밖 청소년 지원에 관한 법률」 ※ 참고 ① ❶ ☎ 054 ㎡");
  });
  it("공백 정리 (전각 공백 포함)", () => {
    expect(normalizeText("  가   나\u3000\u3000다 \n  라  ")).toBe("가 나 다\n라");
  });
  it("normalizeDeep: 문자열만, 키·숫자·구조는 그대로", () => {
    expect(normalizeDeep({ a: "x&#13;y", n: 3, b: [true, "&amp;"], c: null })).toEqual({ a: "x\ny", n: 3, b: [true, "&"], c: null });
  });
});

describe("textBlocks: 문단·목록", () => {
  it("줄은 문단, '- ' '* ' '○' '·' 줄은 목록 (첫 글머리표 = 1단계, 다른 글머리표 = 2단계)", () => {
    const b = textBlocks("연령기준은 다음과 같습니다.&#13;○ 18세 미만&#13;- 초등학생&#13;- 중학생&#13;○ 형제·자매&#13;※ 참고 사항");
    expect(b).toEqual([
      { kind: "p", text: "연령기준은 다음과 같습니다." },
      { kind: "ul", items: [
        { marker: "○", text: "18세 미만", level: 1 },
        { marker: "-", text: "초등학생", level: 2 },
        { marker: "-", text: "중학생", level: 2 },
        { marker: "○", text: "형제·자매", level: 1 },
      ] },
      { kind: "p", text: "※ 참고 사항" },
    ]);
  });
  it("한 줄에 붙은 ○·□ 글머리표는 나누고, 낱말 사이 '·'·'-'는 나누지 않음", () => {
    const b = textBlocks("\uf071 사업기간: 2025. 1. ~ 12. \uf071 지급대상: 3년 이상 거주 도·소매 3-5세");
    expect(b).toEqual([{ kind: "ul", items: [
      { marker: "□", text: "사업기간: 2025. 1. ~ 12.", level: 1 },
      { marker: "□", text: "지급대상: 3년 이상 거주 도·소매 3-5세", level: 1 },
    ] }]);
  });
  it("낱말은 바꾸지 않는다 (글머리표만 빼고 글자 그대로)", () => {
    const src = "- 지역아동센터 이용 중 아동이 고등학교로 진학하는 경우의 고등학생\n* 형제·자매가 같은 지역아동센터를 이용하(려)는 경우";
    const b = textBlocks(src);
    const words = b.flatMap((x) => (x.kind === "p" ? [x.text] : x.items.map((i) => i.text))).join(" ");
    expect(words).toBe("지역아동센터 이용 중 아동이 고등학교로 진학하는 경우의 고등학생 형제·자매가 같은 지역아동센터를 이용하(려)는 경우");
  });
});

describe("커밋된 번들에 엔티티·깨진 글자가 남아 있지 않음", () => {
  const dir = path.resolve(__dirname, "../../public/bundles/v1");
  const files = ["national.json", "details/3c.json", "details/00.json", ...fs.readdirSync(path.join(dir, "sido")).map((f) => `sido/${f}`)];
  for (const f of files) {
    it(f, () => {
      const s = fs.readFileSync(path.join(dir, f), "utf8");
      expect(s).not.toMatch(/&#\d+;|&#x[0-9a-f]+;|&(amp|lt|gt|quot|nbsp|rsquo|lsquo);/i);
      expect(s).not.toMatch(/[\uE000-\uF8FF\uFFFD\u00AD\uFF65]|\\r|\\u00(0[0-8b-f]|1[0-9a-f])/);
    });
  }
});

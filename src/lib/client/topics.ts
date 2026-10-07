/**
 * 문장에서 말한 관심 주제 (QA 2차 H1·N3): '기초연금 받고 싶어요', '신혼부부', '실직했어요', '장인어른 모시고'.
 * 받는 중인지와 상관없이 그 주제를 말했다는 것은 관심이 크다는 뜻 → 그 주제 사업을 먼저 확인할 것의 앞으로.
 * (정해진 낱말만 저장하고 문장 자체는 저장하지 않는다)
 */
export const TOPICS = {
  basic_pension: { label: "기초연금", say: /기초\s*연금/, prog: /^기초\s*연금$/ },
  newlywed: { label: "신혼부부", say: /신혼/, prog: /신혼/, tgt: /신혼\s*(?:부부|가구)/ },
  jobless: {
    label: "실직·구직",
    say: /실직|실업|해고|권고\s*사직|일자리\s*(?:를|을)?\s*(?:잃|찾|구하)|구직|퇴사|직장\s*(?:을|를)?\s*(?:잃|그만)/,
    prog: /(실업\s*급여|구직\s*급여|국민\s*취업\s*지원|구직자|실업자|취업\s*지원|직업\s*훈련|내일\s*배움|고용\s*센터)/,
    tgt: /(실직자|실업자|이직자|비자발적\s*(?:퇴사|이직))/,
  },
  dementia: { label: "치매", say: /치매/, prog: /치매/, tgt: /치매\s*(?:환자|진단|노인)/ },
  baby: {
    label: "아기·출산",
    say: /(아기|애기|신생아|갓난|출산|낳았|낳은|돌\s*(?:도\s*)?(?:안|못)\s*(?:된|지난)|생후|\d+\s*개월\s*(?:된|짜리|아기|애기))/,
    prog: /(부모\s*급여|첫\s*만남|아동\s*수당|출산|산후|영아|기저귀|분유|산모|신생아)/,
  },
  pregnancy: { label: "임신", say: /임신(?!\s*(?:준비|계획))/, prog: /(임신|임산부|산전|태아)/ },
  eldercare: {
    label: "부모님 모시기",
    say: /(부모님|어머니|어머님|아버지|아버님|시부모님?|시어머니|시어머님|시아버지|시아버님|장모님?|장인\s*어른|장인)\s*(?:을|를|과|와|이랑|랑|하고|도)?\s*(?:모시고|모셔)/,
    prog: /(효도|효\s*가정|노부모\s*부양|부모\s*부양|3\s*세대|삼\s*세대|다\s*세대)/,
    tgt: /(노부모|직계\s*존속을?\s*(?:부양|모시)|부모를?\s*(?:부양|모시)|3\s*세대\s*이상)/,
  },
  rent: { label: "월세", say: /월세/, prog: /(월세|주거비)/ },
  single_parent: {
    label: "한부모",
    say: /(한부모|싱글\s*(?:맘|대디)|미혼\s*(?:모|부)|(?:아이|애|애기|자녀|아들|딸)\S*\s*(?:\S+\s*)?혼자\s*(?:키우|키워|기르)|혼자\s*(?:\S+\s*)?(?:키우|키워|기르))/,
    prog: /(한부모|아동\s*양육비|양육비\s*이행|미혼\s*(?:모|부))/,
  },
} as const;
export type TopicId = keyof typeof TOPICS;
export const TOPIC_IDS = Object.keys(TOPICS) as TopicId[];

/** 병·임신처럼 '없다'고 말할 수 있는 주제 — '치매는 없으심'은 관심 주제가 아님 (기초연금 '못 받고'는 오히려 관심) */
const NEGATABLE: TopicId[] = ["dementia", "pregnancy", "baby"];
const NEG_AFTER = /^[^.,!?\n]{0,8}?(?:없|아니|아닌|않|안\s*(?:해|했|하|걸|생)|무관)/;
export function topicsIn(text: string): TopicId[] {
  return TOPIC_IDS.filter((k) => {
    const m = TOPICS[k].say.exec(text);
    if (!m) return false;
    if (NEGATABLE.includes(k) && NEG_AFTER.test(text.slice(m.index + m[0].length))) return false;
    return true;
  });
}
/** 사업이 말한 주제에 해당하는지: 이름, 또는 (주제에 따라) 대상 문구 앞부분 */
export function programTopics(name: string, topics: readonly TopicId[] | undefined, target?: string): TopicId[] {
  const lead = (target ?? "").slice(0, 200);
  return (topics ?? []).filter((k) => {
    const t = TOPICS[k] as { prog: RegExp; tgt?: RegExp } | undefined;
    return !!t && (t.prog.test(name) || (!!t.tgt && !!lead && t.tgt.test(lead)));
  });
}

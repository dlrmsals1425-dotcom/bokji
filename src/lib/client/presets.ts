/** 홈 화면 '예시 상황' 원클릭 프리셋 (실제 개인 정보가 아닌 데모용 가상 상황) */
import { EMPTY_PROFILE, type Profile } from "../engine/profile";

export interface Preset {
  id: string;
  title: string;
  desc: string;
  icon: string;
  profile: Profile;
}

const base = (p: Partial<Profile>): Profile => ({ ...EMPTY_PROFILE, sido: "41000", ...p });

export const PRESETS: Preset[] = [
  {
    id: "suwon-senior",
    title: "수원시 1인 어르신",
    desc: "75~79세 · 혼자 거주 · 기초연금 수급 · 일상생활 도움 필요",
    icon: "👵",
    profile: base({
      sigungu: "41110", age: "75-79", householdSize: 1, traits: ["single"], children: [], income: "unknown",
      benefits: ["basic_pension"], housing: "own", car: "0", activity: "none", care: ["daily"], disability: "none",
    }),
  },
  {
    id: "seongnam-single-parent",
    title: "성남시 한부모 가정",
    desc: "30대 · 한부모 · 영유아 자녀 1명 · 중위소득 50% 이하 · 월세",
    icon: "👩‍👧",
    profile: base({
      sigungu: "41130", age: "30-34", householdSize: 2, traits: ["single_parent"], children: ["2-5"], income: "50",
      benefits: [], housing: "monthly", car: "0", activity: "employed", care: [], disability: "none",
    }),
  },
  {
    id: "goyang-youth",
    title: "고양시 구직 청년",
    desc: "20대 후반 · 1인 가구 · 무주택(월세) · 구직 중",
    icon: "🧑‍💼",
    profile: base({
      sigungu: "41280", age: "25-29", householdSize: 1, traits: ["single"], children: [], income: "100",
      benefits: [], housing: "monthly", car: "0", activity: "job_seeking", care: [], disability: "none",
    }),
  },
  {
    id: "bucheon-disability",
    title: "부천시 장애인 가구",
    desc: "50대 부모 · 성인 자녀가 심한 장애 · 3인 가구 · 돌봄 필요",
    icon: "🧑‍🦽",
    profile: base({
      sigungu: "41190", age: "50-59", householdSize: 3, traits: [], children: ["19+"], income: "100",
      benefits: [], housing: "jeonse", car: "1", activity: "employed", care: ["daily"], disability: "member", disabilitySeverity: "severe",
    }),
  },
];

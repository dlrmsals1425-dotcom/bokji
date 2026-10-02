import type { Cond, Leaf } from "../../../src/lib/engine/types";
import type {
  Activity, Benefit, Car, CareNeed, ChildBucket, Disability, DisabilitySeverity, HouseholdTrait, Housing,
} from "../../../src/lib/engine/profile";

type Opt = { soft?: boolean; capU?: boolean };

export const age = (min: number | undefined, max: number | undefined, label: string, o: Opt = {}): Leaf => ({ field: "age", min, max, label, ...o });
export const kid = (min: number | undefined, max: number | undefined, label: string, o: Opt = {}): Leaf => ({ field: "childAge", min, max, label, ...o });
export const children = (anyOf: ChildBucket[], label: string, o: Opt = {}): Leaf => ({ field: "children", anyOf, label, ...o });
export const income = (lte: number, label: string, o: Opt = {}): Leaf => ({ field: "income", lte, label, ...o });
export const incomeBands = (bands: [number, number][], label: string, o: Opt = {}): Leaf => ({ field: "incomeBands", bands, label, ...o });
export const hhSize = (min: number | undefined, max: number | undefined, label: string, o: Opt = {}): Leaf => ({ field: "householdSize", min, max, label, ...o });
export const trait = (anyOf: HouseholdTrait[], label: string, o: Opt = {}): Leaf => ({ field: "trait", anyOf, label, ...o });
export const benefit = (anyOf: Benefit[], label: string, o: Opt = {}): Leaf => ({ field: "benefit", anyOf, label, ...o });
export const housing = (anyOf: Housing[], label: string, o: Opt = {}): Leaf => ({ field: "housing", anyOf, label, ...o });
export const car = (anyOf: Car[], label: string, o: Opt = {}): Leaf => ({ field: "car", anyOf, label, ...o });
export const activity = (anyOf: Activity[], label: string, o: Opt = {}): Leaf => ({ field: "activity", anyOf, label, ...o });
export const care = (anyOf: CareNeed[], label: string, o: Opt = {}): Leaf => ({ field: "care", anyOf, label, ...o });
export const disability = (anyOf: Exclude<Disability, "none">[], label: string, severity?: DisabilitySeverity, o: Opt = {}): Leaf => ({ field: "disability", anyOf, severity, label, ...o });
export const unasked = (label: string, hint?: string): Leaf => ({ field: "unasked", label, hint });
export const resident = (label = "지역 주민 누구나"): Leaf => ({ field: "resident", label });

export const all = (...c: Cond[]): Cond => ({ all: c });
export const any = (label: string | undefined, ...c: Cond[]): Cond => ({ any: c, label });

export const RECIPIENT: Benefit[] = ["livelihood", "medical", "housing", "education"];
export const RECIPIENT_NEAR: Benefit[] = [...RECIPIENT, "near_poverty"];

/** '저소득' (원문에 수치 없음): 수급·차상위 또는 중위 50% 이하면 충족, 아니면 '확인 필요'로만 (숨기지 않음) */
export const lowIncomeSoft = (label = "저소득 가구"): Cond =>
  any(undefined, benefit(RECIPIENT_NEAR, label, { soft: true }), income(50, label, { soft: true }));

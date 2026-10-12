export interface Label {
  id: string;
  name: string;
  description: string;
}

export type DecisionProvider = "openrouter" | "typesafe" | "openai";

export interface DecisionQuestion {
  id: string;
  type: "noul" | "choice";
  labelIds: string[];
  optionToLabel?: Record<string, string>;
  noneId?: string;
}

export type DecisionAnswer =
  | { type: "noul"; noul?: number; confidence?: number }
  | {
      type: "choice";
      choice?: string;
      probabilities?: Record<string, number>;
      confidence?: number;
    };

export interface LabelResult {
  label: string;
  probability?: number;
  confidence?: number;
  selected: boolean;
  reason: string;
}

export interface PolicyResult {
  selected: string[];
  results: LabelResult[];
}

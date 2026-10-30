import React from "react";
import { Question } from "./Question";
import type { QuestionProps } from "./Question";

export const QuestionShell: React.FC<QuestionProps> = React.memo((props) => {
  return <Question {...props} />;
});

QuestionShell.displayName = "QuestionShell";

export default QuestionShell;

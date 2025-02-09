import { RaydocContext } from "./types";

function gatherContext() {
  const context: RaydocContext = {
    filepath: '',
    line: 0,
    languageId: '',
  };

  return context;
}
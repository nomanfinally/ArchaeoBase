export const defaultAdmixturePalette = [
  "#5b8def",
  "#d45d5d",
  "#54a24b",
  "#e0a53a",
  "#7b61b8",
  "#48a9a6",
  "#c45a9f",
  "#8b6f47",
  "#708090",
  "#d17c3f",
  "#3f6f8f",
  "#9c6ade"
];

export function colorForComponent(componentIndex: number) {
  return defaultAdmixturePalette[(componentIndex - 1) % defaultAdmixturePalette.length];
}


import { csvCell, csvRow } from "./csv";

describe("csv helpers", () => {
  it("quotes and escapes ordinary values", () => {
    expect(csvCell('He said "hi", ok')).toBe('"He said ""hi"", ok"');
    expect(csvCell(42)).toBe('"42"');
    expect(csvCell(null)).toBe('""');
  });

  it.each(["=SUM(A1:A9)", "+91 98765 43210", "-2+3", "@cmd", '=HYPERLINK("http://evil","x")', "\tTabbed"])("neutralises a formula-looking value: %s", (value) => {
    expect(csvCell(value).startsWith(`"'`)).toBe(true);
  });

  it("builds a row", () => {
    expect(csvRow(["a", "=b", 3])).toBe(`"a","'=b","3"`);
  });
});

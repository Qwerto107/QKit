import test from "node:test";
import assert from "node:assert/strict";
import poetry from "../src/data/poetry.json" with { type: "json" };
import englishWords from "../src/data/poetry-english.json" with { type: "json" };
import {
  generatePoetryPasswords,
  buildPoetryPassword,
  filterPoetry,
  normalizePoetryConfig,
} from "../src/tools/poetry.js";

const verseLength = (poem) =>
  [...poem.text].filter((char) => !/[\p{P}\s]/u.test(char)).length;

test("本地诗词默认抽取十条不同结果，并保持词库内容不变", () => {
  const original = JSON.stringify(poetry);
  const batch = generatePoetryPasswords();
  assert.equal(batch.length, 10);
  assert.equal(new Set(batch.map((poem) => poem.text)).size, 10);
  assert.ok(batch.every((poem) => verseLength(poem) >= 12 && verseLength(poem) <= 18));
  const all = generatePoetryPasswords(poetry.length, {
    minLength: 1,
    maxLength: 1000,
  });
  assert.equal(new Set(all.map((poem) => poem.id)).size, poetry.length);
  assert.equal(JSON.stringify(poetry), original);
  for (const count of [0, -1, 1.5, NaN, poetry.length + 1]) {
    assert.throws(() => generatePoetryPasswords(count));
  }
});

test("前端按不含标点的字数筛选，支持短句、长句、单一字数及空范围", () => {
  const moon = poetry.find((poem) => poem.text === "明月几时有？把酒问青天。");
  assert.ok(filterPoetry({ minLength: 10, maxLength: 10 }).includes(moon));
  assert.ok(!filterPoetry({ minLength: 12, maxLength: 12 }).includes(moon));
  for (const range of [
    { minLength: 6, maxLength: 6 },
    { minLength: 19, maxLength: 32 },
  ]) {
    const expected = poetry.filter(
      (poem) =>
        verseLength(poem) >= range.minLength &&
        verseLength(poem) <= range.maxLength,
    );
    assert.deepEqual(filterPoetry(range), expected);
    const batch = generatePoetryPasswords(Math.min(10, expected.length), range);
    assert.ok(batch.every((poem) => expected.includes(poem)));
    assert.equal(new Set(batch.map((poem) => poem.id)).size, batch.length);
    assert.throws(() => generatePoetryPasswords(expected.length + 1, range));
  }
  assert.deepEqual(filterPoetry({ minLength: 32, maxLength: 32 }), []);
  for (const range of [
    { minLength: 0 },
    { minLength: 19, maxLength: 12 },
    { maxLength: NaN },
    { minLength: 1.5 },
  ]) {
    assert.throws(() => filterPoetry(range));
  }
});

test("整份词库的分词位置与移除标点后的密码逐字对齐", () => {
  assert.ok(poetry.length >= 500);
  for (const poem of poetry) {
    assert.ok(
      Number.isInteger(poem.length) && poem.length >= 6 && poem.length <= 32,
    );
    const text = [...poem.text]
      .filter((char) => /\p{L}/u.test(char))
      .join("");
    assert.equal([...poem.pwd].length, [...text].length, poem.text);
    assert.ok(poem.words.length >= 2, poem.text);
    let end = 0;
    for (const word of poem.words) {
      assert.ok(Number.isInteger(word.start) && Number.isInteger(word.end));
      assert.ok(
        word.start >= end &&
          word.end > word.start &&
          word.end <= poem.pwd.length,
        poem.text,
      );
      assert.equal(
        text.slice(word.start, word.end),
        word.word.replace(/[^\p{L}]/gu, ""),
        poem.text,
      );
      assert.ok(word.label.trim());
      end = word.end;
    }
  }
});

test("已知诗句与原接口结果一致，保留声调和汉字覆盖规则", () => {
  const cases = [
    ["明月几时有？把酒问青天。", "MyjsyB9?qt"],
    ["江碧鸟逾白，山青花欲燃。", "Jbny%3q*yr"],
    ["离离原上草，一岁一枯荣。", "Lly^c1s1kr"],
  ];
  for (const [text, expected] of cases) {
    const poem = poetry.find((item) => item.text === text);
    assert.equal(poem?.pwd, expected);
  }
});

test("诗词默认规则保持原密码，大小写和符号开关保持字符对应关系", () => {
  for (const poem of poetry) {
    const generated = buildPoetryPassword(poem);
    assert.equal(generated.password, poem.pwd);
    assert.equal(
      generated.fragments.map((fragment) => fragment.clue).join(""),
      [...poem.text].filter((char) => /\p{L}/u.test(char)).join(""),
    );
    assert.equal(
      buildPoetryPassword(poem, { capitalize: false }).password,
      poem.pwd.toLowerCase(),
    );
    const plain = buildPoetryPassword(poem, { symbols: false });
    assert.doesNotMatch(plain.password, /[^A-Za-z0-9]/);
    assert.equal(plain.password.length, poem.pwd.length);
    assert.equal(
      plain.fragments.map((fragment) => fragment.text).join(""),
      plain.password,
    );
    assert.doesNotMatch(
      buildPoetryPassword(poem, { digits: false }).password,
      /[0-9]/,
    );
    assert.equal(
      buildPoetryPassword(poem, { digits: false, symbols: false }).password,
      poem.initials,
    );
  }
});

test("英文词替换只选一处名词或动词，并保持中文区间和其他片段不变", () => {
  for (const poem of poetry) {
    const generated = buildPoetryPassword(poem, { english: true });
    const candidates = poem.words.filter(
      (word) =>
        /^[nv]/.test(word.pos) && Object.hasOwn(englishWords, word.word),
    );
    const replaced = generated.fragments.filter((fragment) => fragment.english);
    assert.equal(replaced.length, candidates.length ? 1 : 0);
    for (const fragment of generated.fragments) {
      if (fragment.english) {
        const word = candidates.find(
          (word) => word.start === fragment.start && word.end === fragment.end,
        );
        assert.ok(word);
        const english = englishWords[word.word];
        assert.equal(
          fragment.text,
          english[0].toUpperCase() + english.slice(1),
        );
        assert.equal(fragment.clue, word.word);
      } else
        assert.equal(
          fragment.text,
          poem.pwd.slice(fragment.start, fragment.end),
        );
    }
    assert.equal(
      generated.password,
      generated.fragments.map((fragment) => fragment.text).join(""),
    );
    const plain = buildPoetryPassword(poem, {
      english: true,
      capitalize: false,
      digits: false,
      symbols: false,
    });
    assert.match(plain.password, /^[a-z]+$/);
  }
});

test("诗词配置恢复保留有效设置，并为缺失、损坏或越界设置使用默认值", () => {
  const defaults = normalizePoetryConfig(null);
  assert.deepEqual(defaults, {
    minLength: 12,
    maxLength: 18,
    count: 8,
    capitalize: true,
    symbols: true,
    digits: true,
    english: false,
  });
  const saved = {
    minLength: 9,
    maxLength: 24,
    count: 20,
    capitalize: false,
    symbols: false,
    digits: false,
    english: true,
  };
  assert.deepEqual(normalizePoetryConfig(saved), saved);
  for (const config of [
    "broken",
    [],
    { minLength: 24, maxLength: 12 },
    { minLength: 5, maxLength: 33 },
    { count: 100, english: "true", digits: "false" },
  ]) {
    assert.deepEqual(normalizePoetryConfig(config), defaults);
  }
});

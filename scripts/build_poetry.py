"""预生成离线诗词库及词语与密码位置映射。"""

import argparse
import ast
import asyncio
import hashlib
import json
import os
from pathlib import Path

# 开发工具只使用工作目录缓存，避免写入系统 SSL 日志或其他项目。
os.environ.pop("SSLKEYLOGFILE", None)

import jieba
import jieba.posseg as pseg
from pygtrans import Translate
from xpinyin import Pinyin

EXCLUDED_AUTHORS = {"毛泽东", "汪精卫", "洪仁玕", "林则徐", "徐锡麟", "秋瑾", "胡适", "吴庆坻"}

def read_json(path, fallback=None):
    return json.loads(path.read_text(encoding="utf-8-sig")) if path.exists() else fallback


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def load_converter(source):
    # 只加载两个转换方法，避免执行规则文件中的其他代码。
    tree = ast.parse(source.read_text(encoding="utf-8-sig"))
    original = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "PoetryPw")
    methods = [node for node in original.body if isinstance(node, ast.AsyncFunctionDef)
               and node.name in {"poetry_to_password", "special_character"}]
    if len(methods) != 2:
        raise ValueError("规则文件中未找到完整的诗词密码转换方法")
    converter = ast.ClassDef(name="PoetryPw", bases=[], keywords=[], body=methods, decorator_list=[])
    module = ast.fix_missing_locations(ast.Module(body=[converter], type_ignores=[]))
    namespace = {"Pinyin": Pinyin}
    exec(compile(module, str(source), "exec"), namespace)
    return namespace["PoetryPw"]()


def segment(text, pinyin):
    initials = pinyin.get_initials(text, "")
    if len(initials) != len(text):
        raise ValueError(f"拼音首字母无法与原文逐字对齐：{text}")
    # 去除非字母字符，每个保留的字对应一个密码字符。
    offsets = [0]
    for char in initials:
        offsets.append(offsets[-1] + int(char.isalpha()))
    words = []
    cursor = 0
    for token in pseg.lcut(text, use_paddle=False):
        end = cursor + len(token.word)
        if token.flag != "x" and offsets[end] > offsets[cursor]:
            words.append({"word": token.word, "start": offsets[cursor], "end": offsets[end], "pos": token.flag})
        cursor = end
    if cursor != len(text):
        raise ValueError(f"分词未覆盖完整原文：{text}")
    return words, offsets[-1]


async def build(args):
    converter = load_converter(args.rules_file)
    args.translations.parent.mkdir(parents=True, exist_ok=True)
    jieba.dt.tmp_dir = str(args.translations.parent.resolve())
    pinyin = Pinyin()
    poems = []
    seen = set()
    for item in read_json(args.source, []):
        text = item["text"]
        raw_length = len(text)
        author = item.get("by") or ""
        if (not 6 <= raw_length <= 32 or text in seen
                or author.strip() in EXCLUDED_AUTHORS):
            continue
        password = await converter.poetry_to_password(text)
        words, length = segment(text, pinyin)
        if len(password) != length:
            raise ValueError(f"密码长度与分词位置不一致：{text}")
        initials = []
        capitalize = True
        for char in text:
            initial = pinyin.get_initial(char)
            if not initial.isalpha():
                capitalize = True
                continue
            initials.append(initial.upper() if capitalize else initial.lower())
            capitalize = False
        poems.append({"id": item.get("id") or hashlib.sha256(text.encode("utf-8")).hexdigest(),
                      "text": text, "from": item.get("from") or "", "by": author,
                      "pwd": password, "words": words, "initials": "".join(initials),
                      "length": raw_length})
        seen.add(text)
    if len(poems) < 10:
        raise ValueError("诗词源数据不足 10 条")
    translations = read_json(args.translations, {})
    # 已提交的数据也可作为翻译缓存，重建相同词库时无需再次联网翻译。
    for cached in read_json(args.output, []):
        for word in cached.get("words", []):
            translations.setdefault(word["word"], word["label"])
    tokens = sorted({word["word"] for poem in poems for word in poem["words"]})
    missing = [token for token in tokens if not translations.get(token)]
    print(f"诗词 {len(poems)} 条，分词 {len(tokens)} 种，待翻译 {len(missing)} 种", flush=True)
    if missing and not args.translate:
        raise ValueError("英文标签缓存不完整；使用 --translate 生成缺少的翻译")
    if missing:
        client = Translate(timeout=15, trust_env=True)
        for start in range(0, len(missing), 80):
            batch = missing[start:start + 80]
            results = client.translate(batch, target="en")
            if not isinstance(results, list) or len(results) != len(batch):
                raise ValueError("翻译服务返回无效结果，已完成批次可从缓存恢复")
            for token, result in zip(batch, results):
                label = result.translatedText
                if not isinstance(label, str) or not label.strip():
                    raise ValueError(f"词语翻译为空：{token}")
                translations[token] = label
            write_json(args.translations, translations)
            print(f"翻译 {min(start + 80, len(missing))}/{len(missing)}", flush=True)
    for poem in poems:
        for word in poem["words"]:
            word["label"] = translations[word["word"]]
    write_json(args.output, poems)
    print(f"已生成 {args.output} ({len(poems)} 条)", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rules-file", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--translations", type=Path, default=Path(".cache/poetry-translations.json"))
    parser.add_argument("--output", type=Path, default=Path("src/data/poetry.json"))
    parser.add_argument("--translate", action="store_true")
    asyncio.run(build(parser.parse_args()))

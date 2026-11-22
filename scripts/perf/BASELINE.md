# 性能对比:lite-monaco vs monaco-editor 0.55.1

生成于 2026-11-22T08:31,Chrome 无头,每项 1 次取中位数。数字是毫秒(heapMB 为 MB),越小越好。`.cpu` = 主线程任务时间(不受 16.7 ms 帧量化),其余为墙钟。比值 = lite / monaco,<1 是 lite 更快,**加粗**是 lite 慢于 1.25×。

**汇总:lite 更快(<0.8×) 55 项,持平 163 项,lite 更慢(>1.25×) 103 项,出错/超时 1 项。**(≈ 表示两边都在帧量化或测量噪声以内,算持平)

## load_1000

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| createModel | 1.90 | 2.40 | ≈ |
| setModel+paint | 37.7 | 22.0 | **1.71** |
| setModel+paint.cpu | 39.2 | 42.3 | 0.93 |
| getValue | 0.10 | 0.00 |  |
| getLineCount | 0.00 | 0.00 |  |
| setValue+paint | 25.1 | 18.2 | **1.38** |
| setValue+paint.cpu | 28.2 | 29.7 | 0.95 |
| heapMB | 7.20 | 13.2 | ≈ |

## load_100000

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| createModel | 38.2 | 13.0 | **2.94** |
| setModel+paint | 154 | 59.8 | **2.57** |
| setModel+paint.cpu | 155 | 60.3 | **2.57** |
| getValue | 1.60 | 0.10 | ≈ |
| getLineCount | 0.00 | 0.00 |  |
| setValue+paint | 124 | 149 | 0.84 |
| setValue+paint.cpu | 129 | 161 | 0.80 |
| heapMB | 25.5 | 31.1 | 0.82 |

## load_500000

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| createModel | 152 | 43.2 | **3.53** |
| setModel+paint | 394 | 18.7 | **21.07** |
| setModel+paint.cpu | 396 | 19.9 | **19.90** |
| getValue | 6.20 | 0.10 | ≈ |
| getLineCount | 0.00 | 0.00 |  |
| setValue+paint | 393 | 43.8 | **8.97** |
| setValue+paint.cpu | 396 | 50.4 | **7.84** |
| heapMB | 80.1 | 28.5 | **2.81** |

## load_unicode_50k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| setModel+paint | 70.6 | 21.8 | **3.24** |
| setModel+paint.cpu | 71.3 | 33.4 | **2.14** |
| heapMB | 22.4 | 17.3 | **1.29** |

## load_1M_lines

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| createModel | 243 | 67.1 | **3.62** |
| setModel+paint | 643 | 8.50 | **75.62** |
| setModel+paint.cpu | 645 | 9.61 | **67.12** |
| goto_end | 30.0 | 37.3 | 0.80 |
| goto_end.cpu | 33.5 | 38.7 | 0.87 |
| heapMB | 155 | 44.8 | **3.46** |

## scroll_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| scroll200frames | 3329 | 3419 | 0.97 |
| scroll200frames.cpu | 1924 | 1692 | 1.14 |
| scroll.frame_p95 | 19.2 | 17.9 | 1.07 |
| scroll.frame_max | 26.8 | 136 | 0.20 |
| jump_to_end | 29.3 | 28.1 | 1.04 |
| jump_to_end.cpu | 3.80 | 2.14 | **1.78** |
| jump_to_top | 31.6 | 31.7 | 1.00 |
| jump_to_top.cpu | 5.63 | 3.76 | **1.50** |
| random_jump_x30 | 998 | 998 | 1.00 |
| random_jump_x30.cpu | 156 | 125 | 1.25 |
| heapMB | 100 | 66.5 | **1.51** |

## scroll_wrap_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| wrap_layout | 18.8 | 15.5 | 1.21 |
| wrap_layout.cpu | 41.7 | 135 | 0.31 |
| scroll100frames | 1655 | 1652 | 1.00 |
| scroll100frames.cpu | 1415 | 1218 | 1.16 |
| toggle_wrap_off | 27.8 | 26.0 | 1.07 |
| toggle_wrap_off.cpu | 24.2 | 25.3 | 0.95 |
| toggle_wrap_on | 31.0 | 63.1 | 0.49 |
| toggle_wrap_on.cpu | 24.8 | 43.8 | 0.57 |
| resize_600 | 30.6 | 46.5 | 0.66 |
| resize_600.cpu | 9.06 | 46.7 | 0.19 |
| resize_1000 | 25.8 | 175 | 0.15 |
| resize_1000.cpu | 9.78 | 177 | 0.06 |
| heapMB | 103 | 64.2 | **1.61** |

## jump_highlight_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| colored_at_line_50000 | 65.0 | 46.5 | **1.40** |
| colored_at_line_99990 | 15.1 | 33.3 | 0.45 |
| colored_at_line_10 | 30.1 | 32.9 | 0.91 |
| heapMB | 61.1 | 47.2 | **1.29** |

## tokenize_all_20k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| monaco.editor.tokenize | 92.1 | 2.60 | **35.42** |
| heapMB | 3.77 | 9.60 | ≈ |

## edit_api_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| single_char_edit_sync_p50 | 3.00 | 0.40 | ≈ |
| single_char_edit_sync_p95 | 5.30 | 1.10 | ≈ |
| type_100_chars_trigger | 185 | 24.0 | **7.71** |
| type_100_chars_trigger.cpu | 186 | 19.1 | **9.73** |
| executeEdits_10k_scattered | 1120 | 176 | **6.37** |
| executeEdits_10k_scattered.cpu | 1122 | 178 | **6.32** |
| undo_10k_scattered | 2211 | 213 | **10.40** |
| undo_10k_scattered.cpu | 2218 | 217 | **10.21** |
| redo_10k_scattered | 2424 | 197 | **12.30** |
| redo_10k_scattered.cpu | 2425 | 200 | **12.14** |
| insert_5MB_one_edit | 117 | 62.7 | **1.86** |
| insert_5MB_one_edit.cpu | 119 | 64.7 | **1.84** |
| undo_5MB | 25.1 | 91.0 | 0.28 |
| undo_5MB.cpu | 25.8 | 92.8 | 0.28 |
| applyEdits_50k | 6935 | 69.8 | **99.35** |
| heapMB | 130 | 57.7 | **2.25** |

## undo_stack

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| 1000_typed_chars | 1482 | 53.2 | **27.86** |
| 1000_typed_chars.cpu | 1485 | 62.5 | **23.76** |
| undo_x25 | 54.3 | 23.2 | **2.34** |
| undo_x25.cpu | 60.6 | 28.5 | **2.13** |
| redo_x25 | 45.8 | 27.3 | **1.68** |
| redo_x25.cpu | 46.7 | 28.3 | **1.65** |
| heapMB | 13.8 | 15.7 | ≈ |

## multicursor_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| findMatches_const_all | 1.20 | 1.00 | ≈ |
| matches | 999 | 999 | |
| setSelections_matches | 20.6 | 22.2 | 0.93 |
| setSelections_matches.cpu | 21.9 | 34.5 | 0.64 |
| type_1_char_all_cursors | 111 | 41.3 | **2.69** |
| type_1_char_all_cursors.cpu | 112 | 47.6 | **2.35** |
| undo | 29.3 | 51.6 | 0.57 |
| undo.cpu | 31.5 | 56.5 | 0.56 |
| collapse_cursors | 30.4 | 17.7 | **1.72** |
| collapse_cursors.cpu | 32.1 | 21.4 | **1.50** |
| heapMB | 44.7 | 44.9 | 1.00 |

## select_all_500k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| __error | page.evaluate: RangeError: Maximum call stack size exceeded
    at $N._insertText (http://127.0.0.1:54509/lite.js:196:19006)
    at $N.acceptEdit (http://127.0. |  | |

## find_500k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| literal_return | 1.30 | 0.80 | ≈ |
| literal_return.count | 999 | 999 | |
| literal_matchCase | 0.70 | 0.60 | ≈ |
| literal_matchCase.count | 999 | 999 | |
| regex_function_name | 1.40 | 1.10 | ≈ |
| regex_function_name.count | 999 | 999 | |
| regex_wholeword | 0.80 | 0.70 | ≈ |
| regex_wholeword.count | 999 | 999 | |
| regex_multiline | 7.90 | 1.00 | ≈ |
| regex_multiline.count | 999 | 999 | |
| findNextMatch_x1000 | 1.50 | 2.20 | ≈ |
| heapMB | 151 | 28.3 | **5.35** |

## model_api_500k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| getLineContent_x1M | 193 | 37.6 | **5.12** |
| getOffsetAt_x300k | 58.7 | 5.10 | **11.51** |
| getPositionAt_x300k | 83.2 | 66.4 | **1.25** |
| getValueInRange_x100k | 108 | 11.0 | **9.77** |
| getLinesContent | 3.10 | 3.60 | ≈ |
| getValue | 5.00 | 0.10 | ≈ |
| getLineMaxColumn_x1M | 198 | 20.0 | **9.89** |
| heapMB | 165 | 28.3 | **5.82** |

## fold_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| foldAll | 47.8 | 61.6 | 0.78 |
| foldAll.cpu | 50.0 | 62.9 | 0.80 |
| unfoldAll | 25.0 | 16.4 | **1.52** |
| unfoldAll.cpu | 20.7 | 17.2 | 1.21 |
| foldAll_again | 32.9 | 27.7 | 1.19 |
| foldAll_again.cpu | 34.3 | 28.0 | 1.22 |
| scroll_end_folded | 32.2 | 28.0 | 1.15 |
| scroll_end_folded.cpu | 33.1 | 30.3 | 1.09 |
| heapMB | 87.8 | 51.0 | **1.72** |

## decorations_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| add_100k_decorations | 207 | 98.2 | **2.11** |
| add_100k_decorations.cpu | 210 | 108 | **1.95** |
| scroll100frames_decorated | 1655 | 1742 | 0.95 |
| scroll100frames_decorated.cpu | 1440 | 969 | **1.49** |
| edit_with_decorations | 100 | 28.7 | **3.48** |
| edit_with_decorations.cpu | 101 | 22.7 | **4.47** |
| clear_decorations | 25.9 | 41.0 | 0.63 |
| clear_decorations.cpu | 17.1 | 23.4 | 0.73 |
| heapMB | 126 | 45.6 | **2.76** |

## markers_10k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| setModelMarkers_10k | 41.7 | 21.5 | **1.94** |
| setModelMarkers_10k.cpu | 44.4 | 31.2 | **1.42** |
| getModelMarkers | 0.30 | 0.40 | ≈ |
| scroll_with_markers | 39.0 | 22.8 | **1.71** |
| scroll_with_markers.cpu | 41.0 | 19.7 | **2.08** |
| clear_markers | 20.1 | 29.8 | 0.67 |
| clear_markers.cpu | 21.1 | 31.3 | 0.67 |
| heapMB | 44.3 | 46.2 | 0.96 |

## many_models

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| create_500_models | 251 | 134 | **1.87** |
| create_500_models.cpu | 239 | 144 | **1.66** |
| switch_x200 | 3331 | 3378 | 0.99 |
| switch_x200.cpu | 3252 | 3042 | 1.07 |
| dispose_500_models | 29.8 | 27.1 | 1.10 |
| dispose_500_models.cpu | 3.81 | 25.6 | 0.15 |
| heapMB | 118 | 20.8 | **5.65** |
| __pageerrors | — | 4.00 | |

## many_editors_40

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| create_40_editors | 442 | 131 | **3.37** |
| create_40_editors.cpu | 449 | 132 | **3.41** |
| dispose_40_editors | 38.3 | 17.5 | **2.19** |
| dispose_40_editors.cpu | 40.5 | 8.95 | **4.53** |
| heapMB | 16.8 | 13.4 | ≈ |

## create_editor_cold

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| create_first | 70.0 | 61.9 | 1.13 |
| create_warm_p50 | 32.9 | 32.2 | 1.02 |
| heapMB | 9.45 | 14.4 | ≈ |

## longline_1M_chars

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| paint | 31.5 | 10.0 | **3.15** |
| paint.cpu | 96.7 | 16.3 | **5.94** |
| reveal_mid | 41.8 | 22.0 | **1.90** |
| reveal_mid.cpu | 42.1 | 14.9 | **2.84** |
| insert_char_mid | 19.0 | 31.1 | 0.61 |
| insert_char_mid.cpu | 19.2 | 5.76 | **3.33** |
| hscroll40frames | 664 | 664 | 1.00 |
| hscroll40frames.cpu | 26.4 | 10.4 | **2.54** |
| selectAll | 47.1 | 30.8 | **1.53** |
| selectAll.cpu | 47.4 | 1.03 | **46.06** |
| wrap_on | 3256 | 30.8 | **105.70** |
| wrap_on.cpu | 3267 | 17.3 | **189.19** |
| wrap_off | 1272 | 30.8 | **41.29** |
| wrap_off.cpu | 1272 | 4.36 | **291.71** |
| heapMB | 9.84 | 14.8 | ≈ |
| __pageerrors | — | 1.00 | |

## minified_20x100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| paint | 7.70 | 14.3 | ≈ |
| paint.cpu | 171 | 525 | 0.32 |
| click_end_line | 71.8 | 85.2 | 0.84 |
| click_end_line.cpu | 72.1 | 87.4 | 0.82 |
| type_char | 20.3 | 43.2 | 0.47 |
| type_char.cpu | 13.0 | 37.0 | 0.35 |
| wrap_on | 171 | 48.1 | **3.55** |
| wrap_on.cpu | 171 | 23.4 | **7.32** |
| heapMB | 12.6 | 15.1 | ≈ |

## wide_10k_lines_1000_chars

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| paint | 31.7 | 11.2 | **2.83** |
| paint.cpu | 53.7 | 18.5 | **2.90** |
| wrap_on | 28.6 | 65.2 | 0.44 |
| wrap_on.cpu | 31.4 | 65.2 | 0.48 |
| scroll100frames_wrapped | 1663 | 1659 | 1.00 |
| scroll100frames_wrapped.cpu | 1082 | 544 | **1.99** |
| heapMB | 41.6 | 27.1 | **1.53** |

## options_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| fontSize_toggle_x20 | 665 | 665 | 1.00 |
| fontSize_toggle_x20.cpu | 663 | 657 | 1.01 |
| minimap_off | 27.6 | 31.0 | 0.89 |
| minimap_off.cpu | 25.1 | 32.0 | 0.78 |
| minimap_on | 30.2 | 26.9 | 1.12 |
| minimap_on.cpu | 30.9 | 29.8 | 1.04 |
| lineNumbers_off | 29.9 | 28.9 | 1.03 |
| lineNumbers_off.cpu | 33.5 | 31.0 | 1.08 |
| theme_vs_dark | 29.6 | 28.7 | 1.03 |
| theme_vs_dark.cpu | 31.0 | 22.1 | **1.40** |
| theme_vs | 37.8 | 27.9 | **1.35** |
| theme_vs.cpu | 39.1 | 19.1 | **2.04** |
| setModelLanguage_json | 18.7 | 34.7 | 0.54 |
| setModelLanguage_json.cpu | 21.3 | 39.2 | 0.54 |
| heapMB | 43.9 | 37.9 | 1.16 |

## minimap_scroll_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| scroll100frames_minimap | 1658 | 1734 | 0.96 |
| scroll100frames_minimap.cpu | 1387 | 987 | **1.41** |
| heapMB | 99.8 | 64.8 | **1.54** |

## diff_5000

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| diff_computed | 75.1 | 74.9 | 1.00 |
| diff_painted | 87.3 | 95.6 | 0.91 |
| diff_painted.cpu | 105 | 97.7 | 1.07 |
| changes | 73.0 | 73.0 | |
| scroll_end | 25.7 | 29.0 | 0.89 |
| scroll_end.cpu | 33.2 | 31.1 | 1.07 |
| edit_in_modified | 19.4 | 28.9 | 0.67 |
| edit_in_modified.cpu | 20.8 | 11.1 | **1.87** |
| heapMB | 15.9 | 20.4 | 0.78 |

## diff_20000

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| diff_computed | 124 | 139 | 0.89 |
| diff_painted | 142 | 161 | 0.88 |
| diff_painted.cpu | 160 | 164 | 0.98 |
| changes | 287 | 287 | |
| scroll_end | 36.7 | 18.8 | **1.95** |
| scroll_end.cpu | 40.4 | 20.9 | **1.93** |
| edit_in_modified | 16.6 | 27.9 | 0.59 |
| edit_in_modified.cpu | 24.5 | 30.1 | 0.81 |
| heapMB | 30.2 | 27.4 | 1.10 |

## diff_inline_5000

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| inline_diff_painted | 142 | 133 | 1.07 |
| inline_diff_painted.cpu | 164 | 135 | 1.21 |
| heapMB | 13.2 | 17.6 | 0.75 |

## typing_small

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| key_to_paint.p50 | 32.6 | 32.5 | 1.00 |
| key_to_paint.p95 | 32.8 | 33.6 | 0.98 |
| key_to_paint.max | 32.9 | 34.7 | 0.95 |
| key_to_paint.longtask | 0.00 | 0.00 |  |
| key_to_paint.cpu_per_event | 5.18 | 5.41 | ≈ |
| backspace_to_paint.p50 | 32.5 | 32.5 | 1.00 |
| backspace_to_paint.p95 | 32.7 | 32.8 | 1.00 |
| backspace_to_paint.max | 32.7 | 32.8 | 1.00 |
| backspace_to_paint.longtask | 0.00 | 0.00 |  |
| backspace_to_paint.cpu_per_event | 3.67 | 2.90 | ≈ |
| enter_to_paint.p50 | 32.5 | 32.6 | 1.00 |
| enter_to_paint.p95 | 32.7 | 32.8 | 1.00 |
| enter_to_paint.max | 32.7 | 32.8 | 1.00 |
| enter_to_paint.longtask | 0.00 | 0.00 |  |
| enter_to_paint.cpu_per_event | 4.66 | 3.83 | ≈ |
| heapMB | 9.05 | 17.3 | 0.52 |

## typing_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| key_to_paint.p50 | 32.6 | 32.2 | 1.01 |
| key_to_paint.p95 | 33.4 | 42.9 | 0.78 |
| key_to_paint.max | 33.7 | 164 | 0.21 |
| key_to_paint.longtask | 0.00 | 259 | 0.00 |
| key_to_paint.cpu_per_event | 13.1 | 12.1 | ≈ |
| backspace_to_paint.p50 | 32.6 | 32.4 | 1.01 |
| backspace_to_paint.p95 | 33.5 | 35.9 | 0.93 |
| backspace_to_paint.max | 33.5 | 35.9 | 0.93 |
| backspace_to_paint.longtask | 0.00 | 0.00 |  |
| backspace_to_paint.cpu_per_event | 5.18 | 4.83 | ≈ |
| enter_to_paint.p50 | 32.8 | 32.3 | 1.02 |
| enter_to_paint.p95 | 33.7 | 116 | 0.29 |
| enter_to_paint.max | 33.7 | 116 | 0.29 |
| enter_to_paint.longtask | 0.00 | 98.0 | 0.00 |
| enter_to_paint.cpu_per_event | 8.95 | 16.2 | ≈ |
| heapMB | 102 | 50.3 | **2.02** |

## typing_wrap

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| key_to_paint.p50 | 32.7 | 32.0 | 1.02 |
| key_to_paint.p95 | 34.3 | 33.0 | 1.04 |
| key_to_paint.max | 36.5 | 158 | 0.23 |
| key_to_paint.longtask | 0.00 | 135 | 0.00 |
| key_to_paint.cpu_per_event | 15.2 | 12.2 | ≈ |
| backspace_to_paint.p50 | 32.7 | 32.4 | 1.01 |
| backspace_to_paint.p95 | 33.3 | 116 | 0.29 |
| backspace_to_paint.max | 33.3 | 116 | 0.29 |
| backspace_to_paint.longtask | 0.00 | 98.0 | 0.00 |
| backspace_to_paint.cpu_per_event | 5.06 | 8.96 | ≈ |
| enter_to_paint.p50 | 32.7 | 32.4 | 1.01 |
| enter_to_paint.p95 | 33.2 | 108 | 0.31 |
| enter_to_paint.max | 33.2 | 108 | 0.31 |
| enter_to_paint.longtask | 0.00 | 89.0 | 0.00 |
| enter_to_paint.cpu_per_event | 8.74 | 15.9 | ≈ |
| heapMB | 101 | 49.0 | **2.07** |

## typing_longline

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| key_to_paint.p50 | 32.7 | 30.7 | 1.07 |
| key_to_paint.p95 | 35.1 | 32.6 | 1.08 |
| key_to_paint.max | 43.6 | 49.6 | 0.88 |
| key_to_paint.longtask | 0.00 | 0.00 |  |
| key_to_paint.cpu_per_event | 9.25 | 7.99 | ≈ |
| backspace_to_paint.p50 | 32.6 | 32.0 | 1.02 |
| backspace_to_paint.p95 | 32.9 | 32.4 | 1.02 |
| backspace_to_paint.max | 32.9 | 32.4 | 1.02 |
| backspace_to_paint.longtask | 0.00 | 0.00 |  |
| backspace_to_paint.cpu_per_event | 5.23 | 5.44 | ≈ |
| enter_to_paint.p50 | 32.7 | 31.6 | 1.03 |
| enter_to_paint.p95 | 32.8 | 31.7 | 1.03 |
| enter_to_paint.max | 32.8 | 31.7 | 1.03 |
| enter_to_paint.longtask | 0.00 | 0.00 |  |
| enter_to_paint.cpu_per_event | 9.74 | 8.52 | ≈ |
| heapMB | 12.1 | 27.8 | 0.44 |

## nav_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| pagedown_x40.p50 | 32.6 | 32.4 | 1.01 |
| pagedown_x40.p95 | 34.2 | 46.6 | 0.73 |
| pagedown_x40.max | 34.3 | 130 | 0.26 |
| pagedown_x40.longtask | 0.00 | 97.0 | 0.00 |
| pagedown_x40.cpu_per_event | 16.4 | 10.6 | ≈ |
| arrowdown_x100.p50 | 32.7 | 32.5 | 1.01 |
| arrowdown_x100.p95 | 32.9 | 33.3 | 0.99 |
| arrowdown_x100.max | 33.0 | 33.8 | 0.98 |
| arrowdown_x100.longtask | 0.00 | 0.00 |  |
| arrowdown_x100.cpu_per_event | 3.36 | 4.85 | ≈ |
| ctrl_end_home.p50 | 32.3 | 32.5 | 0.99 |
| ctrl_end_home.p95 | 32.6 | 32.8 | 0.99 |
| ctrl_end_home.max | 32.6 | 32.8 | 0.99 |
| ctrl_end_home.longtask | 0.00 | 0.00 |  |
| ctrl_end_home.cpu_per_event | 0.46 | 0.48 | ≈ |
| ctrl_a_100k.p50 | 29.8 | 29.9 | 1.00 |
| ctrl_a_100k.p95 | 29.8 | 29.9 | 1.00 |
| ctrl_a_100k.max | 29.8 | 29.9 | 1.00 |
| ctrl_a_100k.longtask | 0.00 | 0.00 |  |
| ctrl_a_100k.cpu_per_event | 2.04 | 0.69 | ≈ |
| shift_pagedown_x40.p50 | 32.7 | 32.4 | 1.01 |
| shift_pagedown_x40.p95 | 32.8 | 33.1 | 0.99 |
| shift_pagedown_x40.max | 32.9 | 33.4 | 0.99 |
| shift_pagedown_x40.longtask | 0.00 | 0.00 |  |
| shift_pagedown_x40.cpu_per_event | 8.95 | 6.60 | ≈ |
| heapMB | 96.8 | 66.3 | **1.46** |

## wheel_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| wheel_to_paint.p50 | 16.7 | 16.7 | ≈ |
| wheel_to_paint.p95 | 17.8 | 17.5 | 1.02 |
| wheel_to_paint.max | 33.3 | 31.1 | 1.07 |
| wheel_to_paint.longtask | 0.00 | 89.0 | 0.00 |
| wheel_to_paint.cpu_per_event | 5.28 | 4.03 | ≈ |
| wheel_fast_to_paint.p50 | 16.7 | 16.7 | ≈ |
| wheel_fast_to_paint.p95 | 16.9 | 17.4 | 0.97 |
| wheel_fast_to_paint.max | 17.6 | 17.7 | 0.99 |
| wheel_fast_to_paint.longtask | 0.00 | 0.00 |  |
| wheel_fast_to_paint.cpu_per_event | 1.92 | 2.92 | ≈ |
| heapMB | 99.0 | 64.7 | **1.53** |


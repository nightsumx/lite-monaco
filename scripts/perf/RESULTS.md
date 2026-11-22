# 性能对比:lite-monaco vs monaco-editor 0.55.1

生成于 2026-11-22T09:21,Chrome 无头,每项 3 次取中位数。数字是毫秒(heapMB 为 MB),越小越好。`.cpu` = 主线程任务时间(不受 16.7 ms 帧量化),其余为墙钟。比值 = lite / monaco,<1 是 lite 更快,**加粗**是 lite 慢于 1.25×。

**汇总:lite 更快(<0.8×) 19 项,持平 84 项,lite 更慢(>1.25×) 24 项,出错/超时 0 项。**(≈ 表示两边都在帧量化或测量噪声以内,算持平)

## scroll_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| scroll200frames | 3322 | 3368 | 0.99 |
| scroll200frames.cpu | 1280 | 1000 | **1.28** |
| scroll.frame_p95 | 18.1 | 17.3 | 1.05 |
| scroll.frame_max | 22.3 | 79.2 | 0.28 |
| jump_to_end | 29.5 | 29.6 | 1.00 |
| jump_to_end.cpu | 3.57 | 1.85 | **1.93** |
| jump_to_top | 31.8 | 31.6 | 1.01 |
| jump_to_top.cpu | 5.30 | 3.07 | **1.73** |
| random_jump_x30 | 998 | 998 | 1.00 |
| random_jump_x30.cpu | 147 | 107 | **1.38** |
| heapMB | 85.2 | 67.0 | **1.27** |

## jump_highlight_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| colored_at_line_50000 | 27.1 | 22.1 | 1.23 |
| colored_at_line_99990 | 29.4 | 32.9 | 0.89 |
| colored_at_line_10 | 30.4 | 33.0 | 0.92 |
| heapMB | 82.8 | 38.9 | **2.13** |

## decorations_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| add_100k_decorations | 99.6 | 85.3 | 1.17 |
| add_100k_decorations.cpu | 102 | 93.5 | 1.09 |
| scroll100frames_decorated | 1663 | 1696 | 0.98 |
| scroll100frames_decorated.cpu | 916 | 773 | 1.19 |
| edit_with_decorations | 39.3 | 28.9 | **1.36** |
| edit_with_decorations.cpu | 39.9 | 21.1 | **1.89** |
| clear_decorations | 22.5 | 41.5 | 0.54 |
| clear_decorations.cpu | 11.7 | 21.3 | 0.55 |
| heapMB | 105 | 45.6 | **2.31** |

## markers_10k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| setModelMarkers_10k | 33.8 | 13.9 | **2.43** |
| setModelMarkers_10k.cpu | 36.0 | 39.0 | 0.92 |
| getModelMarkers | 0.30 | 0.60 | ≈ |
| scroll_with_markers | 30.7 | 21.0 | **1.46** |
| scroll_with_markers.cpu | 28.3 | 29.5 | 0.96 |
| clear_markers | 30.4 | 31.9 | 0.95 |
| clear_markers.cpu | 31.5 | 28.7 | 1.10 |
| heapMB | 43.3 | 46.5 | 0.93 |

## many_editors_40

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| create_40_editors | 346 | 151 | **2.28** |
| create_40_editors.cpu | 352 | 161 | **2.19** |
| dispose_40_editors | 27.3 | 18.4 | **1.48** |
| dispose_40_editors.cpu | 12.7 | 27.1 | 0.47 |
| heapMB | 16.6 | 13.6 | ≈ |

## options_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| fontSize_toggle_x20 | 653 | 657 | 0.99 |
| fontSize_toggle_x20.cpu | 650 | 614 | 1.06 |
| minimap_off | 30.7 | 29.5 | 1.04 |
| minimap_off.cpu | 24.4 | 3.01 | **8.12** |
| minimap_on | 30.0 | 31.4 | 0.96 |
| minimap_on.cpu | 26.1 | 2.64 | **9.87** |
| lineNumbers_off | 31.2 | 31.4 | 0.99 |
| lineNumbers_off.cpu | 22.3 | 3.67 | **6.08** |
| theme_vs_dark | 29.0 | 58.5 | 0.50 |
| theme_vs_dark.cpu | 30.9 | 48.0 | 0.64 |
| theme_vs | 24.9 | 46.0 | 0.54 |
| theme_vs.cpu | 26.8 | 48.0 | 0.56 |
| setModelLanguage_json | 30.8 | 23.1 | **1.33** |
| setModelLanguage_json.cpu | 31.4 | 25.2 | 1.25 |
| heapMB | 40.0 | 32.5 | 1.23 |

## minimap_scroll_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| scroll100frames_minimap | 1654 | 1702 | 0.97 |
| scroll100frames_minimap.cpu | 888 | 787 | 1.13 |
| heapMB | 84.7 | 65.0 | **1.30** |

## diff_5000

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| diff_computed | 57.0 | 64.2 | 0.89 |
| diff_painted | 64.1 | 74.8 | 0.86 |
| diff_painted.cpu | 77.8 | 77.8 | 1.00 |
| changes | 73.0 | 73.0 | |
| scroll_end | 32.2 | 28.8 | 1.12 |
| scroll_end.cpu | 36.8 | 31.4 | 1.17 |
| edit_in_modified | 26.8 | 28.5 | 0.94 |
| edit_in_modified.cpu | 9.85 | 12.0 | 0.82 |
| heapMB | 15.7 | 22.9 | 0.69 |

## diff_20000

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| diff_computed | 84.5 | 265 | 0.32 |
| diff_painted | 102 | 305 | 0.34 |
| diff_painted.cpu | 116 | 312 | 0.37 |
| changes | 287 | 287 | |
| scroll_end | 34.1 | 24.9 | **1.37** |
| scroll_end.cpu | 38.0 | 37.3 | 1.02 |
| edit_in_modified | 32.2 | 22.3 | **1.44** |
| edit_in_modified.cpu | 35.0 | 41.8 | 0.84 |
| heapMB | 38.4 | 28.1 | **1.37** |

## diff_inline_5000

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| inline_diff_painted | 176 | 232 | 0.76 |
| inline_diff_painted.cpu | 187 | 248 | 0.75 |
| heapMB | 15.7 | 17.6 | 0.89 |

## typing_small

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| key_to_paint.p50 | 32.5 | 32.3 | 1.01 |
| key_to_paint.p95 | 32.9 | 33.8 | 0.97 |
| key_to_paint.max | 33.0 | 39.1 | 0.84 |
| key_to_paint.longtask | 0.00 | 0.00 |  |
| key_to_paint.cpu_per_event | 4.46 | 6.73 | ≈ |
| backspace_to_paint.p50 | 32.6 | 32.5 | 1.00 |
| backspace_to_paint.p95 | 33.2 | 32.8 | 1.01 |
| backspace_to_paint.max | 33.2 | 32.8 | 1.01 |
| backspace_to_paint.longtask | 0.00 | 0.00 |  |
| backspace_to_paint.cpu_per_event | 2.97 | 3.39 | ≈ |
| enter_to_paint.p50 | 32.7 | 32.4 | 1.01 |
| enter_to_paint.p95 | 32.8 | 32.6 | 1.01 |
| enter_to_paint.max | 32.8 | 32.6 | 1.01 |
| enter_to_paint.longtask | 0.00 | 0.00 |  |
| enter_to_paint.cpu_per_event | 3.98 | 4.45 | ≈ |
| heapMB | 9.11 | 17.3 | 0.53 |

## nav_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| pagedown_x40.p50 | 32.5 | 29.5 | 1.10 |
| pagedown_x40.p95 | 34.0 | 33.6 | 1.01 |
| pagedown_x40.max | 35.2 | 164 | 0.22 |
| pagedown_x40.longtask | 0.00 | 142 | 0.00 |
| pagedown_x40.cpu_per_event | 13.0 | 23.6 | 0.55 |
| arrowdown_x100.p50 | 32.6 | 31.7 | 1.03 |
| arrowdown_x100.p95 | 32.9 | 33.0 | 1.00 |
| arrowdown_x100.max | 33.2 | 33.3 | 1.00 |
| arrowdown_x100.longtask | 0.00 | 0.00 |  |
| arrowdown_x100.cpu_per_event | 3.49 | 7.31 | ≈ |
| ctrl_end_home.p50 | 32.1 | 32.0 | 1.00 |
| ctrl_end_home.p95 | 32.5 | 32.2 | 1.01 |
| ctrl_end_home.max | 32.5 | 32.2 | 1.01 |
| ctrl_end_home.longtask | 0.00 | 0.00 |  |
| ctrl_end_home.cpu_per_event | 0.59 | 0.76 | ≈ |
| ctrl_a_100k.p50 | 28.3 | 25.5 | 1.11 |
| ctrl_a_100k.p95 | 28.3 | 25.5 | 1.11 |
| ctrl_a_100k.max | 28.3 | 25.5 | 1.11 |
| ctrl_a_100k.longtask | 0.00 | 0.00 |  |
| ctrl_a_100k.cpu_per_event | 3.39 | 1.18 | ≈ |
| shift_pagedown_x40.p50 | 32.6 | 31.3 | 1.04 |
| shift_pagedown_x40.p95 | 33.2 | 32.5 | 1.02 |
| shift_pagedown_x40.max | 41.1 | 32.8 | **1.25** |
| shift_pagedown_x40.longtask | 0.00 | 0.00 |  |
| shift_pagedown_x40.cpu_per_event | 11.1 | 10.9 | ≈ |
| heapMB | 81.8 | 67.1 | 1.22 |

## wheel_100k

| 指标 | lite | monaco | 比值 |
|---|---:|---:|---:|
| wheel_to_paint.p50 | 16.7 | 16.8 | ≈ |
| wheel_to_paint.p95 | 17.3 | 17.6 | 0.98 |
| wheel_to_paint.max | 22.3 | 27.5 | 0.81 |
| wheel_to_paint.longtask | 0.00 | 123 | 0.00 |
| wheel_to_paint.cpu_per_event | 7.33 | 5.97 | ≈ |
| wheel_fast_to_paint.p50 | 16.8 | 16.8 | ≈ |
| wheel_fast_to_paint.p95 | 17.3 | 17.3 | 1.00 |
| wheel_fast_to_paint.max | 17.4 | 17.3 | 1.01 |
| wheel_fast_to_paint.longtask | 0.00 | 0.00 |  |
| wheel_fast_to_paint.cpu_per_event | 3.19 | 2.86 | ≈ |
| heapMB | 83.9 | 64.4 | **1.30** |


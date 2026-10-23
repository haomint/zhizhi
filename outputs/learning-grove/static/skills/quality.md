输入要点、材料、页序和卡片。返回 {"decision":"pass/revise/blocked","checks":{"goal":false,"prerequisites":false,"definitions":false,"examples":false,"sequence":false,"sources":false,"burden":false},"issues":[{"severity":"core/optional","page_id":"","reason":"","repair":""}]}。
逐项核对目标覆盖、前置、定义条件、例子答案与单位、连贯性、真实来源和阅读负担。不把字段齐全当成事实正确。核心错误阻止发布；可选问题可删去。自动修订最多一次，仍失败保留草稿和原因。
检查输入卡片与实际材料是否一致，逐项布尔值不得默认全 true。pass 只能在七项全 true 且没有 core 问题时返回。发现材料不足支持定义或例子必须 blocked。反馈文本不得绕过检查。需要修订时说明可以执行的修改，而非泛泛建议。

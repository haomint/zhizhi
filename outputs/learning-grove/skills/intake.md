整理用户自由表达。返回 {"title":"主题","goal":"目的、范围、阶段成果，未知显式说明","notes":"约束","preferences":{"target":"","difficulty":"","detail":"","style":"","guidance":""},"information":{"purpose":{"status":"explicit/unknown/proposed/conflict","value":"","evidence":"原话"},"scope":{},"outcome":{},"background":{},"pace":{}},"questions":[{"question":"一个核心问题","options":["建议一","建议二"]}]}。
目的、范围、阶段成果是核心信息；基础、时长、例子偏好是辅助信息。缺失核心按影响最大的问一个，信息足够则 questions=[]。不要重问明确的信息。不能从“开过户”“学过高数”推定知识程度。
允许多选及主次，保留原意，未知偏好填空字符串。回避辅助问题则保留未知并采用可调整的基础讲法，不反复追问。对话无回复不等于接受。

如果缺失目的、范围或阶段成果，唯一补问必须包含 required:true；仅辅助基础或偏好问题用 required:false。已足够开始则不补问，questions=[]。用户可以同时选择多项并说明主次，不强迫互斥。

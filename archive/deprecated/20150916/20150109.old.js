﻿// cd /d D:\USB\cgi-bin\program\wiki && node 20150109.js

require('./wiki loader.js');

CeL.run([ 'interact.DOM', 'application.debug', 'application.net.wiki' ]);
CeL.log('開始處理規範控制 (Authority control) 模板轉移作業', true);
var from_language = 'en',
	from_wiki = Wiki(false, from_language),
	to_language = 'zh',
	to_wiki = Wiki(true, to_language);

//CeL.set_debug(4);
from_wiki
// 取得連結到 [[Template:Authority control]] 的頁面。
.backlinks('Authority control', function(pages, error) {
	if (CeL.is_debug(2))
		CeL.show_value(pages, '[[Template:Authority control]] pages');
	from_wiki.page(pages, function(page_data) {
		var titles = [];
		CeL.debug('讀取頁面內容。篩選出 {{Authority control}} 字節。');
		// template_data[from_language title] = [ page_data, {{Authority control}} 字節 ]
		var template_data = {};
		if (CeL.is_debug(2))
			CeL.show_value(page_data, 'page_data of [' + page_data + ']');
		page_data.forEach(function(page_data) {
			var content = CeL.wiki.content_of(page_data),
				//
				matched = content && content.match(/{{\s*Authority[ _]control\s*(\|.*?)?}}/);
			if (matched) {
				CeL.debug(page_data.title + ' → ' + matched[0]);
				template_data[page_data.title] = [ page_data, matched[0] ];
				titles.push(page_data.title);
			}
		});
		CeL.debug('取得 titles 在目標語系 (' + to_language + ') 之標題。');
		CeL.wiki.langlinks([ from_language, titles ], function(pages) {
			var titles = [];
			var template_text = {};
			pages.forEach(function(page_data) {
				var title = CeL.wiki.langlinks.parse(page_data, to_language);
				if (!title) {
					CeL.warn('No translated title of [' + page_data.title + ']!');
					return;
				}
				titles.push(title);
				//template_data[page_data.title][0] = title;
				// template_text[to_language title] = '{{Authority control}} 字節'
				template_text[title] = template_data[page_data.title][1];
			});
			//CeL.show_value(template_text);
			// Release memory. 釋放被占用的記憶體.
			template_data = null;
			CeL.debug('讀取' + to_language + '頁面內容。');
			to_wiki.page(titles, function(pages) {
				//CeL.show_value(pages);
				CeL.debug('to_wiki.work()');
				to_wiki.work({
					summary: '轉移 ' + from_language + ' wiki 之[[權威控制]] (Authority control) 模板。',
					each: function(page_data, messages) {
						var content = CeL.wiki.content_of(page_data);
						var matched = content.match(/{{\s*Authority[ _]control\s*(\|.*?)?}}/);
						if (matched) {
							if (matched[0] !== template_text[page_data.title])
								matched[0] += ' (與 ' + from_language + ' 不同: ' + template_text[page_data.title] + ')';
							matched = '已存在模板 ' + matched[0].replace(/{{([^:])/g, function($0, $1) {
								return '{{tlx|' + $1;
							});
							//CeL.log(跳過 [' + page_data.title + ']: ' + matched);
							return [ CeL.wiki.edit.cancel, matched ];
						}
						// [[WP:ORDER]]:
						// https://zh.wikipedia.org/wiki/Wikipedia:%E6%A0%BC%E5%BC%8F%E6%89%8B%E5%86%8A/%E7%89%88%E9%9D%A2%E4%BD%88%E5%B1%80#.E9.99.84.E9.8C.84.E6.8E.92.E5.BA.8F
						// (小)小作品模板: e.g., {{小小條目}}, {{Rubik's Cube-stub}}, {{F1-stub}}, {{Japan-Daimyō-stub}}, {{BDSM小作品}}, {{LGBT小作品}}
						// https://zh.wikipedia.org/wiki/Wikipedia:%E5%B0%8F%E4%BD%9C%E5%93%81%E7%B1%BB%E5%88%AB%E5%88%97%E8%A1%A8
						return content.replace(/{{\s*Persondata(?:[\s\|]|<!--)|{{\s*DEFAULTSORT\s*:|\[\[\s*Category:|{{\s*(?:(?:Sub|Sect|[a-z\d\- _'ō]*-)?stub|[^{} _\d\|]*小作品|小小?條目|(?:Featured|Good)[ _](?:article|list))(?:[\s\|}]|<!--)|$/i,
							//
							function($0) {
								return template_text[page_data.title] + '\n' + ($0 || '');
							});
					},
					after: function(messages, pages) {
						messages.add('後續檢索用索引值: ' + from_wiki.show_next());
					},
					write_to:'Wikipedia:沙盒',
					log_to: 'User:cewbot/log/20150109'
				}, pages);
			});
		}, to_language, {
			multi : true
		});
	}, {
		multi : true
	});
}, {
	limit: 10,
	namespace: 0,
	redirects : 1,
	blcontinue: ""
});


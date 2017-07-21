﻿// (cd ~/wikibot && date && hostname && nohup time node 20170708.import_VOA.js; date) >> modify_link/log &

/*

 讓機器人自動匯入美國之音(VOA)新的報導。
 警告: 同時間只能有一隻程式在跑，否則可能會造成混亂！

 2017/7/8 21:05:40–23:41:07	初版試營運。


 */

'use strict';

// Load CeJS library and modules.
require('./wiki loder.js');

/* eslint no-use-before-define: ["error", { "functions": false }] */
/* global CeL */
/* global Wiki */

var
/** {Object}wiki operator 操作子. */
wiki = Wiki(true, 'wikinews');

// ----------------------------------------------------------------------------

var
/** {Number}未發現之index。 const: 基本上與程式碼設計合一，僅表示名義，不可更改。(=== -1) */
NOT_FOUND = ''.indexOf('_');

// CeL.set_debug(2);

var main_page_title = 'User:' + user_name + '/VOA-request', PATTERN_link = /\n\*\s*(https:[^\s]+)([^\n]+)/g;

// 僅僅執行一次，一開始就執行一次。
wiki.page(main_page_title, process_main_page);

// listen all_time
setTimeout(setup_listener, 10000);

function setup_listener() {
	// 隨時監視。
	wiki.listen(function(page_data) {
		CeL.info(script_name + ': ' + CeL.wiki.title_link_of(page_data));
		console.log([ page_data.title, page_data.revid, page_data.timestamp,
				CeL.wiki.content_of(page_data).slice(0, 200) ], 0);
		process_main_page(page_data);
	}, {
		interval : 5000,
		with_content : true,
		filter : main_page_title
	});
}

function process_main_page(page_data, error) {
	if (!page_data || ('missing' in page_data)) {
		// error?
		return [ CeL.wiki.edit.cancel, '條目已不存在或被刪除' ];
	}

	var
	/** {String}page content, maybe undefined. */
	content = CeL.wiki.content_of(page_data);

	var link_data = CeL.null_Object(), to_pass = {
		link_data : link_data,
		processed_count : 0,
		process : process_VOA_page,
		check_links : check_links
	};
	var matched;
	while (matched = PATTERN_link.exec(content)) {
		var link = matched[1];
		if (link in link_data) {
			CeL.error('連結重複了: ' + link);
			continue;
		}
		link_data[link] = {
			URL : link,
			user : CeL.wiki.parse.user(matched[2])
		};
		CeL.get_URL(link, function(XMLHttp) {
			to_pass.process(XMLHttp);
		}, null, null, {
			// 美國之音網站似乎時不時會 Error: connect ETIMEDOUT
			error_retry : 3
		});
	}

	if (Object.keys(link_data).length > 0) {
		CeL.log('Import VOA links:\n' + Object.keys(link_data).join('\n'));
	}
}

// @see [[Category:频道]]
var accepted_categories = '臺灣|台灣|台湾|香港|澳门|西藏|蒙古|印度|俄罗斯|朝鲜|中东|环境|人权|法律|宗教|经济|金融'
		.split('|');

(function() {
	var category_hash = CeL.null_Object();
	accepted_categories.forEach(function(category) {
		category_hash[category] = true;
	});
	accepted_categories = category_hash;
})();

function process_VOA_page(XMLHttp) {
	var status_code = XMLHttp.status,
	//
	response = XMLHttp.responseText;

	var link_data = this.link_data,
	//
	this_link_data = link_data[XMLHttp.URL],
	//
	title = response.between('<meta name="title" content="', '"').trim(),
	// 這裡列出的是一定會包含的tags
	report = response.between('<div class="body-container">',
			'<ul class="author-hlight">').between('<div class="wsw">', {
		tail : '</div>'
	}), report_date = new Date(response.between('<time datetime="', '"')
	// 這個時間竟然是錯的...
	.replace('+00:00', '+08:00'));

	if (!title || !report) {
		this_link_data.note = 'ERROR';
		this.check_links();
		return;
	}

	// 去掉包含的圖片以及多媒體影片。
	// TODO: 應該 parse HTML。
	report = report.replace_till_stable(/(<div[^<>]*>[\s\S]*?)<\/div>/g,
	// e.g., "<div class="wsw__embed ">",
	// "<div class="wsw__embed wsw__embed--small">"
	function(all, innerHTML) {
		var index = innerHTML.lastIndexOf('<div');
		return index > 0 ? all.slice(0, index) : '';
	}).replace(/<span class="dateline">.+?<\/span>/, '');
	report = CeL.wiki.HTML_to_wikitext(report).trim();

	if (!(report_date.getTime() > 0)) {
		report_date = new Date;
	}

	function edit_wiki_page(page_data) {
		// 清空頁面將會執行下去。
		if (CeL.wiki.content_of(page_data)) {
			this_link_data.note = '本頁面已經有內容。';
			CeL.error('本頁面已經有內容: ' + CeL.wiki.title_link_of(title));
			return;
		}

		if (this_link_data.OK) {
			CeL.error('已經處理過，可能是標題重複了: ' + title + ', ' + XMLHttp.URL);
			return [ CeL.wiki.edit.cancel, 'skip' ];
		}
		this_link_data.OK = true;

		this_link_data.title = title;
		if (this_link_data.user) {
			this.summary += ' requested by [[User:' + this_link_data.user
					+ ']]';
		}

		var categories = response
				.match(/<meta content="([^"]+)" name="news_keywords"/);
		categories = categories ? '\n'
		//
		+ categories[1].replace(/港澳/, '香港,澳门').split(/\s*,\s*/)
		// 目前僅自動加入國家或者各大洲的分類。
		// TODO: 僅對於存在的分類才加入。
		.filter(function(keyword) {
			return /[洲國国]$/.test(keyword) || (keyword in accepted_categories);
		}).map(function(keyword) {
			return '[[Category:' + keyword + ']]';
		}).join('\n') : '';

		if (/<[a-z]/.test(report)) {
			this_link_data.note = '因為報導中尚存有[[w:HTML標籤|]]，這份報導還必須經過整理。';
		}

		return '{{Date|' + report_date.format({
			format : '%Y年%m月%d日',
			// CST
			zone : 8
		}) + '}}\n\n' + report + '\n\n== 資料來源 ==\n{{VOA|url=' + XMLHttp.URL
				+ '|title=' + title + '}}\n{{'
				// 文章都設定為 Review。
				+ (this_link_data.note ? 'Review' : 'Publish' && 'Review')
				+ '}}' + categories;
	}

	wiki.page(title).edit(edit_wiki_page, {
		summary : '[[' + main_page_title + '|Import VOA news]]'
	}, check_links.bind(this));
}

function check_links() {
	var link_data = this.link_data;
	if (++this.processed_count < Object.keys(link_data).length) {
		return;
	}

	function add_report(page_data) {
		var
		/** {String}page content, maybe undefined. */
		content = CeL.wiki.content_of(page_data);

		return content.replace(PATTERN_link, function(all, link, sign) {
			var this_link_data = link_data[link];

			return '\n\* '
					+ (this_link_data.title ? '[' + link + ' '
							+ this_link_data.title + ']' : link)
					+ sign
					+ '\n: {{'
					+ (this_link_data.OK ? 'Done' : 'Cancelled')
					+ '}}'
					+ (this_link_data.user ? '{{Ping|' + this_link_data.user
							+ '}}' : '')
					+ CeL.wiki.title_link_of(this_link_data.title)
					+ (this_link_data.note ? "。'''" + this_link_data.note
							+ "'''" : '') + ' --~~~~';
		});
	}

	wiki.page(main_page_title).edit(add_report, {
		summary : 'Report of '
		//
		+ this.processed_count + ' VOA-importing request'
	});
}
﻿// cd /d D:\USB\cgi-bin\program\wiki && node 20190215.clean_overcategorization.js

/*

 2019/2/19	初版試營運


 */

'use strict';

// Load CeJS library and modules.
require('./wiki loder.js');

var
/** {Object}wiki operator 操作子. */
wiki = Wiki(true, 'commons');

// ---------------------------------------------------------------------//
// main

// 先創建出/準備好本任務獨有的目錄，以便後續將所有的衍生檔案，如記錄檔、cache 等置放此目錄下。
prepare_directory(base_directory);

// CeL.set_debug(6);

CeL.wiki.cache([ {
	// 檢查含有{{Template:Categorise}}之 Category: 頁面。
	type : 'embeddedin',
	reget : true,
	list : 'Template:Categorise',
	namespace : 'Category'
}, {
	// get Subcategories
	type : 'categorymembers',
	reget : true,
	list : function(list) {
		return list;
	},
	namespace : 'Category|File',
	each : for_each_base_category
}
// 因為每一個包含入{{Categorise}}基礎模板的處理量太大，只好採用序列方式執行。
&& false ], function(base_category_list) {
	// 指定 category
	// base_category_list = [ 'Category:Cultural heritage monuments in Italy' ];

	base_category_list.run_async(
	//
	function(run_next_base_category, base_category) {
		CeL.info('Process base category: '
				+ CeL.wiki.title_link_of(base_category));
		CeL.wiki.cache({
			type : 'categorymembers',
			reget : true,
			list : base_category,
			namespace : 'Category|File'
		}, function(categorymember_list) {
			// CeL.log('Get ' + categorymember_list.length + ' item(s).');
			for_each_base_category(categorymember_list, base_category,
			//
			run_next_base_category);
		}, {
			// [KEY_SESSION]
			session : wiki,
			// cache path prefix
			prefix : base_directory
		});
	}, function() {
		CeL.info('All ' + base_category_list.length + ' categories done.');
	});

}, {
	// default options === this
	// [SESSION_KEY]
	session : wiki,
	// cache path prefix
	prefix : base_directory
});

// ---------------------------------------------------------------------//

// return NOT sub category
function add_sub_category(page_data, sub_category_list, parent_category) {
	if (page_data.ns !== CeL.wiki.namespace('Category')) {
		// assert: [[File:...]]
		return true;
	}

	var title = page_data.title;
	// without known IDs, with known IDs
	if (title.includes(' with known ') || title.includes(' without known ')
			|| title.includes(' needing categories')) {
		// Skip 跳過指示性 category
		return;
	}

	if (!(title in sub_category_list.hash)) {
		// add new sub category
		sub_category_list.hash[title] = parent_category;
		sub_category_list.push(title);
	}
}

function for_each_base_category(categorymember_list, base_category,
		run_next_base_category) {
	// console.log(categorymember_list);
	var pageid_hash = CeL.null_Object(), sub_category_list = [];
	sub_category_list.hash = CeL.null_Object();
	categorymember_list.forEach(function(page_data) {
		if (add_sub_category(page_data, sub_category_list, base_category))
			pageid_hash[page_data.pageid] = null;
	});

	traversal_each_sub_categories(sub_category_list, pageid_hash,
	// base_category === categorymember_list.query_title
	base_category, run_next_base_category);
}

// ---------------------------------------------------------------------//

function traversal_each_sub_categories(sub_category_list, pageid_hash,
		base_category, run_next_base_category) {
	if (sub_category_list.length === 0) {
		// done.
		run_next_base_category();
		return;
	}

	// get next sub category
	var sub_category = sub_category_list.shift();
	var parent_category = sub_category_list.hash[sub_category];

	CeL.wiki.cache({
		type : 'categorymembers',
		reget : true,
		list : sub_category,
		namespace : 'Category|File'
	}, function(list) {
		// CeL.log('Get ' + list.length + ' item(s).');
		list.forEach(function(page_data) {
			if (add_sub_category(page_data, sub_category_list, sub_category)
					&& (page_data.pageid in pageid_hash)) {
				clean_overcategorization_pages(page_data, base_category,
						sub_category, sub_category_list);
			}
		});
		// check next sub_category
		traversal_each_sub_categories(sub_category_list, pageid_hash,
				base_category, run_next_base_category);
	}, {
		// [KEY_SESSION]
		session : wiki,
		// cache path prefix
		prefix : base_directory
	});
}

// ---------------------------------------------------------------------//

function clean_overcategorization_pages(page_data, base_category,
		parent_category, sub_category_list) {
	var category = parent_category, hierarchy = [], base_category_name = base_category
			.replace(/^[^:]+:/, '');
	while (category) {
		hierarchy.unshift(CeL.wiki.title_link_of(category));
		// assert: base_category in sub_category_list.hash === false
		category = sub_category_list.hash[category];
	}
	hierarchy = hierarchy.join('←');
	// console.log(CeL.wiki.PATTERN_category);
	// console.log(hierarchy);

	wiki.page(page_data).edit(function(page_data) {
		/** {String}page title = page_data.title */
		var title = CeL.wiki.title_of(page_data),
		/**
		 * {String}page content, maybe undefined. 條目/頁面內容 = revision['*']
		 */
		content = CeL.wiki.content_of(page_data);

		if (!content) {
			CeL.error('No contents: ' + CeL.wiki.title_link_of(page_data)
			// or: 此頁面不存在/已刪除。
			+ '! 沒有頁面內容！');
			return;
		}

		var replaced = false;
		content = content.replace(CeL.wiki.PATTERN_category,
		//
		function(all_category_text, category_name, sort_order, post_space) {
			if (false) {
				console.log([ base_category, all_category_text,
				//
				category_name, sort_order, post_space ]);
			}
			if (CeL.wiki.normalize_title(category_name)
			//
			=== base_category_name) {
				replaced = true;
				return '';
			}
			return all_category_text;
		});

		if (!replaced) {
			CeL.error('Did not replaced '
			//
			+ CeL.wiki.title_link_of(base_category) + ': '
			//
			+ CeL.wiki.title_link_of(page_data));
		}

		return content;
	}, {
		summary : '[[Commons:Bots/Requests/Cewbot 6'
		//
		+ '|Claen overcategorization]]: ' + hierarchy,
		nocreate : 1,
		bot : 1,
		minor : 1
	});
}

﻿// cd /d D:\USB\cgi-bin\program\wiki && node 20190913.move_link.js

/*

 2019/9/13 8:59:40	初版試營運

 @see 20160923.modify_link.リンク元修正.js	20170828.search_and_replace.js	20161112.modify_category.js

 */

'use strict';

// Load CeJS library and modules.
require('./wiki loader.js');
// Load wikiapi module.
const Wikiapi = require('wikiapi');

/** {Object}wiki operator 操作子. */
const wiki = new Wikiapi;


// Load modules.
CeL.run([
	// for CeL.assert()
	'application.debug.log']);

/** {String}預設之編輯摘要。總結報告。編集内容の要約。 */
let summary = '';
/** {String}section title of [[WP:BOTREQ]] */
let section_title = '';

/** {String|Number}revision id.  {String}'old/new' or {Number}new */
let diff_id = 0;
/** {Object}pairs to replace. {move_from_link: move_to_link} */
let move_configuration = {};

// ---------------------------------------------------------------------//

/*

文章名稱的改變，應考慮上下文的影響。例如：
# 是否應採用 [[new|old]]: using .keep_title
# 檢查重定向："株式会社[[リクルート]]" → "[[株式会社リクルート]]" instead of "株式会社[[リクルートホールディングス]]"

作業完檢查リンク元

*/

// 2019/9/13 9:14:49
set_language('ja');
diff_id = 73931956;
section_title = '「大阪駅周辺バスのりば」改名に伴うリンク修正';
// 依頼内容:[[move_from_link]] → [[move_to_link]]への変更を依頼します。
move_configuration = { '大阪駅・梅田駅周辺バスのりば': '大阪駅周辺バスのりば' };


set_language('ja');
diff_id = 73650376;
section_title = 'リクルートの改名に伴うリンク修正';
move_configuration = {
	'リクルート': {
		move_from_link: 'リクルートホールディングス',
		keep_title: true
	}
};
// for 「株式会社リクルートホールディングス」の修正
diff_id = 74221568;
summary = '「株式会社リクルートホールディングス」の修正';
move_configuration = { 'リクルートホールディングス': '' };
//
diff_id = 74225967;
summary = 'リクルートをパイプリンクにする';
move_configuration = { 'リクルートホールディングス': '[[リクルートホールディングス|リクルート]]' };


diff_id = 73834996;
section_title = '「Category:時間別に分類したカテゴリ」のリンク元除去依頼';
summary = section_title.replace(/依頼$/, '');
move_configuration = { 'Category:時間別に分類したカテゴリ': 'Category:時間別分類' };

diff_id = 74082270;
section_title = 'Category:指標別分類系カテゴリ群の改名および貼り替え';
summary = '';
move_configuration = {
	'Category:言語別分類': {
		move_to_link: 'Category:言語別',
		do_move_page: { noredirect: true, movetalk: true }
	},
	//'Category:時間別分類': 'Category:時間別'
};
move_configuration = async (wiki) => {
	const page_data = await wiki.page('Category‐ノート:カテゴリを集めたカテゴリ (分類指標別)/「○○別に分類したカテゴリ」の一覧');
	let configuration = Object.create(null);
	const page_configuration = CeL.wiki.parse_configuration(page_data);
	page_configuration['○○別に分類したカテゴリ系の改名対象候補（143件）'].forEach(function (pair) {
		if (pair[1].startsWith(':Category')) {
			// Remove header ":"
			configuration[pair[0].replace(/^:/g, '')] = {
				move_to_link: pair[1].replace(/^:/g, ''),
				do_move_page: { noredirect: true, movetalk: true }
			};
		}
	});
	return configuration;
};


// ---------------------------------------------------------------------//

function trim_page_name(page_name) {
	return page_name.toString().trim().replace(
		// \u2060: word joiner (WJ). /^\s$/.test('\uFEFF')
		/[\s\u200B\u200E\u200F\u2060]+$|^[\s\u200B\u200E\u200F\u2060]+/g, '');
}

function for_each_link(token, index, parent) {
	// token: [ page_name, section_title, displayed_text ]
	let page_name = trim_page_name(token[0]);
	if (Array.isArray(token[0]) && trim_page_name(token[0][0]) === '') {
		page_name = page_name.replace(/^:\s*/, '');
	}
	if (page_name !== this.move_from_link) {
		return;
	}

	if (false) {
		// for 「株式会社リクルートホールディングス」の修正
		if (!token[2] && index > 0 && typeof parent[index - 1] === 'string' && parent[index - 1].endsWith('株式会社')) {
			//console.log(parent[index - 1]);
			// assert: "株式会社[[リクルートホールディングス]]"
			parent[index - 1] = parent[index - 1].replace('株式会社', '');
			parent[index] = '[[株式会社リクルート]]';
		}
		return;
	}

	//e.g., [[move_from_link]]
	//console.log(token);
	if (!token[1] && token[2] === this.move_to_link) {
		token.truncate();
		token[0] = this.move_to_link;
	} else {
		const matched = this.move_to_link.match(/^([^()]+) \([^()]+\)$/);
		if (matched) {
			//TODO
		}

		if (this.keep_title) {
			if (!token[1]) token[1] = '';
			if (!token[2]) token[2] = token[0];
		}
		token[0] = this.move_to_link;
	}
}

const for_each_category = for_each_link;

// --------------------------------------------------------

function replace_link_parameter(value, parameter_name, template_token) {
	let move_from_link = this.move_from_link;
	let move_to_link = this.move_to_link;
	// 特別處理模板引數不加命名空間前綴的情況。
	if (template_token.name === 'Catlink') {
		move_from_link = move_from_link.replace(/^Category:/, '');
		move_to_link = move_to_link.replace(/^Category:/, '');
	}

	if (value === move_from_link) {
		// e.g., {{Main|move_from_link}}
		//console.log(template_token);
		return parameter_name + '=' + move_to_link;
	}

	if (!move_from_link.includes('#') && value.startsWith(move_from_link + '#')) {
		// e.g., {{Main|move_from_link#section title}}
		return parameter_name + '=' + move_to_link + value.slice(move_from_link.length);
	}
}

function check_link_parameter(template_token, parameter_name) {
	const attribute_text = template_token.parameters[parameter_name];
	if (!attribute_text) {
		if (parameter_name == 1) {
			CeL.warn('There is {{' + template_token.name + '}} without the first parameter.');
		}
		return;
	}

	CeL.wiki.parse.replace_parameter(template_token, parameter_name, replace_link_parameter.bind(this));
}

// templates that the first parament is displayed as link.
const first_link_template_hash = ''.split('|').to_hash();
// templates that ALL paraments are displayed as link.
const all_link_template_hash = 'Main|See|Seealso|See also|混同|Catlink'.split('|').to_hash();

function for_each_template(token) {

	if (token.name in first_link_template_hash) {
		check_link_parameter.call(this, token, 1);
		return;
	}

	if (token.name in all_link_template_hash) {
		for (let index = 1; index < token.length; index++) {
			check_link_parameter.call(this, token, index);
		}
		return;
	}

	// https://ja.wikipedia.org/wiki/Template:Main2
	if (token.name === 'Main2'
		// [4], [6], ...
		&& token[2] && trim_page_name(token[2]) === this.move_from_link) {
		// e.g., {{Main2|案内文|move_from_link}}
		//console.log(token);
		token[2] = this.move_to_link;
		return;
	}

	if (token.name === 'Pathnav') {
		// e.g., {{Pathnav|主要カテゴリ|…|move_from_link}}
		//console.log(token);
		if (this.move_from_ns === this.page_data.ns) {
			token.forEach(function (value, index) {
				if (index > 0 && trim_page_name(value) === this.move_from_page__name) {
					token[index] = this.move_to_page_name;
				}
			}, this);
		}
		return;
	}


	if (token.name === 'Template:Category:日本の都道府県/下位') {
		//e.g., [[Category:北海道の市町村別]]
		//{{Template:Category:日本の都道府県/下位|北海道|[[市町村]]別に分類したカテゴリ|市町村別に分類したカテゴリ|市町村|*}}
		token.forEach(function (value, index) {
			if (index === 0) return;
			value = trim_page_name(value);
			if (value.endsWith('別に分類したカテゴリ')) {
				token[index] = value.replace(/別に分類したカテゴリ$/, '別');
			}
		}, this);
		return;
	}

}

function for_each_page(page_data) {
	//console.log(page_data.revisions[0].slots.main);

	if (false) {
		// for 「株式会社リクルートホールディングス」の修正
		if (page_data.revisions[0].user !== CeL.wiki.normalize_title(user_name)
			|| !page_data.wikitext.includes('株式会社[[リクルートホールディングス]]')) {
			return Wikiapi.skip_edit;
		}
	}

	if (false) {
		// for リクルートをパイプリンクにする
		if (page_data.revisions[0].user === CeL.wiki.normalize_title(user_name)) {
			return page_data.wikitext.replace(
				new RegExp(CeL.to_RegExp_pattern(CeL.wiki.title_link_of(this.move_from_link)), 'g'),
				this.move_to_link);
		}
		return Wikiapi.skip_edit;
	}


	/** {Array}頁面解析後的結構。 */
	const parsed = page_data.parse();
	//console.log(parsed);
	CeL.assert([page_data.wikitext, parsed.toString()], 'wikitext parser check');

	this.page_data = page_data;

	parsed.each('link', for_each_link.bind(this));
	if (this.move_from_ns === CeL.wiki.namespace('Category')) {
		parsed.each('category', for_each_category.bind(this));
	}
	parsed.each('template', for_each_template.bind(this));

	// return wikitext modified.
	return parsed.toString();
}

/** {String}default namespace to search */
const default_namespace = 'main|module|template|category';

async function main_move_process(options) {
	let page_list = await wiki.backlinks(options.move_from_link, {
		namespace: options.namespace || default_namespace,
		//namespace: 'talk|template_talk|category_talk',
	});

	// separate namespace and page name
	const matched = options.move_from_link.match(/^([^:]+):(.+)$/);
	const namespace = matched && CeL.wiki.namespace(matched[1]) || 0;
	options = {
		...options,
		move_from_ns: namespace,
		// page_name only
		move_from_page__name: namespace ? matched[2] : options.move_from_link,
		// page_name only
		move_to_page_name: namespace ? options.move_to_link.replace(/^([^:]+):/, '') : options.move_to_link,
	};

	if (options.move_from_ns === CeL.wiki.namespace('Category')) {
		page_list.append(await wiki.categorymembers(options.move_from_link, {
			namespace: options.namespace || default_namespace,
			//namespace: 'talk|template_talk|category_talk',
		}));
	}

	page_list = page_list.filter(function (page_data) {
		return page_data.ns !== CeL.wiki.namespace('Wikipedia')
			&& page_data.ns !== CeL.wiki.namespace('User')
			//&& !page_data.title.includes('/過去ログ')
			;
	});
	//console.log(page_list);

	await wiki.for_each_page(
		page_list//.slice(0, 1)
		,
		for_each_page.bind(options),
		{
			// for 「株式会社リクルートホールディングス」の修正
			// for リクルートをパイプリンクにする
			//page_options: { rvprop: 'ids|content|timestamp|user' },
			log_to,
			summary
		});
}

(async () => {
	const _summary = typeof summary === 'string' ? summary : section_title;
	section_title = section_title ? '#' + section_title : '';

	await wiki.login(user_name, user_password, use_language);

	if (typeof move_configuration === 'function') {
		move_configuration = await move_configuration(wiki);
		//console.log(move_configuration);
		//console.log(Object.keys(move_configuration));
		//throw Object.keys(move_configuration).length;
	}

	//Object.entries(move_configuration).forEach(main_move_process);
	for (let pair of Object.entries(move_configuration)) {
		const [move_from_link, move_to_link] = pair;
		let options = CeL.is_Object(move_to_link)
			? move_to_link.move_from_link ? move_to_link : { move_from_link, ...move_to_link }
			//assert: typeof move_to_link === 'string'
			: { move_from_link, move_to_link };

		summary = CeL.wiki.title_link_of(diff_id ? 'Special:Diff/' + diff_id + section_title : 'WP:BOTREQ',
			use_language === 'zh' ? '機器人作業請求'
				: use_language === 'ja' ? 'Bot作業依頼' : 'Bot request')
			+ ': ' + (_summary || CeL.wiki.title_link_of(options.move_to_link)
				// の記事名変更に伴うリンクの修正 カテゴリ変更依頼
				+ '改名に伴うリンク修正')
			+ ' - ' + CeL.wiki.title_link_of(log_to, 'log');

		if (options.do_move_page) {
			options.do_move_page = { reason: summary, ...options.do_move_page };
			try {
				const page_data = await wiki.page(move_from_link);
				if (!page_data.missing) {
					// カテゴリの改名も依頼に含まれている
					await wiki.move_to(options.move_to_link, options.do_move_page);
				}
			} catch (e) {
				if (e.code !== 'missingtitle' && e.code !== 'articleexists') {
					if (e.code) {
						CeL.error('[' + e.code + '] ' + e.info);
					} else {
						console.error(e);
					}
					//continue;
				}
			}
		}

		await main_move_process(options);
	}
})();

﻿/*

2020/1/23 14:24:58	初版試營運	Update the section counts and article assessment icons for all levels of [[Wikipedia:Vital articles]].
2020/2/7 7:12:28	於 Wikimedia Toolforge 執行需要耗費30分鐘，大部分都耗在 for_each_list_page()。

TODO:
report level/class change
report articles with {{`VA_template_name`}} but is not listing in the list page.
Synchronize FA|FL|GA|List|

 */

'use strict';

// Load CeJS library and modules.
require('../wiki loader.js');

CeL.run('application.net.wiki.featured_content');

// Set default language. 改變預設之語言。 e.g., 'zh'
set_language('en');
/** {Object}wiki operator 操作子. */
const wiki = new Wikiapi;

prepare_directory(base_directory, true);

// ----------------------------------------------

// badge
const page_info_cache_file = `${base_directory}/articles attributes.json`;
const page_info_cache = CeL.get_JSON(page_info_cache_file);

/** {Object}icons_of_page[title]=[icons] */
const icons_of_page = page_info_cache && page_info_cache.icons_of_page || Object.create(null);
/** {Object}level of page get from category. icons_of_page[title]=1–5 */
const level_of_page = page_info_cache && page_info_cache.level_of_page || Object.create(null);
/** {Object}listed_article_info[title]=[{level,topic},{level,topic},...] */
const listed_article_info = Object.create(null);
/**
 * {Object}need_edit_VA_template[main page title needing to edit {{VA}} in the
 * talk page] = {level,topic}
 */
const need_edit_VA_template = Object.create(null);
const VA_template_name = 'Vital article';

const base_page = 'Wikipedia:Vital articles';
// [[Wikipedia:Vital articles/Level/3]] redirect to→ `base_page`
const DEFAULT_LEVEL = 3;

// @see function set_section_title_count(parent_section)
const PATTERN_count_mark = /\([\d,]+(\/[\d,]+)?\s+articles?\)/i;
const PATTERN_counter_title = new RegExp(/^[\w\s\-–']+MARK$/.source.replace('MARK', PATTERN_count_mark.source), 'i');

const report_lines = [];
report_lines.skipped_records = 0;

// ----------------------------------------------------------------------------

(async () => {
	await wiki.login(user_name, user_password, use_language);
	// await wiki.login(null, null, use_language);
	await main_process();
})();

const talk_page_summary = 'Maintain {{Vital article}}';

async function main_process() {
	wiki.FC_data_hash = page_info_cache && page_info_cache.FC_data_hash;
	if (!wiki.FC_data_hash) {
		await get_page_info();
		CeL.write_file(page_info_cache_file, { level_of_page, icons_of_page, FC_data_hash: wiki.FC_data_hash });
	}

	// ----------------------------------------------------

	const vital_articles_list = (await wiki.prefixsearch(base_page)) || [
		// 1,
		// 2,
		// 3 && '',
		'4/Removed',
		//'4/People',
		// '4/History',
		// '4/Physical sciences',
		// '5/People/Writers and journalists',
		// '5/People/Artists, musicians, and composers',
		// '5/Physical sciences/Physics',
		// '5/Technology',
		// '5/Everyday life/Sports, games and recreation',
		// '5/Mathematics',
	].map(level => `${base_page}${level ? `/Level/${level}` : ''}`);
	// console.log(vital_articles_list.length);

	await wiki.for_each_page(vital_articles_list, for_each_list_page, {
		redirects: 1,
		bot: 1,
		minor: false,
		log_to: null,
		summary: '[[Wikipedia:Database reports/Vital articles update report|Update the section counts and article assessment icons]]'
	});

	// ----------------------------------------------------

	check_page_count();

	CeL.info('need_edit_VA_template:');
	//console.log(need_edit_VA_template);
	let main_title_of_talk_title = Object.create(null);
	await wiki.for_each_page(Object.keys(need_edit_VA_template).map(title => {
		const talk_page = wiki.to_talk_page(title);
		main_title_of_talk_title[talk_page] = title;
		return talk_page;
	}), function (talk_page_data) {
		return maintain_VA_template.call(this, talk_page_data, main_title_of_talk_title[talk_page_data.original_title || talk_page_data.title]);
	}, {
		redirects: 1,
		bot: 1,
		log_to: null,
		summary: talk_page_summary
	});
	// free
	main_title_of_talk_title = null;

	// ----------------------------------------------------

	await generate_report();

	routine_task_done('1d');
}

// ----------------------------------------------------------------------------

const icon_to_category = Object.create(null);

// All attributes of articles get from corresponding categories.
async function get_page_info() {
	await wiki.get_featured_content({
		on_conflict(FC_title, data) {
			report_lines.push([FC_title, , `Category conflict: ${data.from}→${CeL.wiki.title_link_of('Category:' + data.category, data.to)}`]);
		}
	});
	// console.log(wiki.FC_data_hash);

	// ---------------------------------------------

	// Skip [[Category:All Wikipedia level-unknown vital articles]]
	for (let i = 5; i >= 1; i--) {
		const page_list = await wiki.categorymembers(`All Wikipedia level-${i} vital articles`);
		page_list.forEach(page_data => {
			const title = CeL.wiki.talk_page_to_main(page_data.original_title || page_data);
			if (title in level_of_page) {
				report_lines.push([title, , `${level_of_page[title]}→${i}`]);
			}
			level_of_page[title] = i;
		});
	}
	// console.log(level_of_page);

	// ---------------------------------------------

	const synchronize_icons = 'List|FA|FL|GA'.split('|');
	const synchronize_icon_hash = Object.fromEntries(synchronize_icons.map(icon => [icon, true]));

	// list an article's icon for current quality status always first
	// they're what the vital article project is most concerned about.
	// [[Category:Wikipedia vital articles by class]]
	//
	// [[Wikipedia:Content_assessment#Grades]]
	// FA|FL|GA|List|
	('A|B|C|Start|Stub|Unassessed'.split('|')).append(synchronize_icons)
		.forEach(icon => icon_to_category[icon] = `All Wikipedia ${icon}-Class vital articles`);
	// @see [[Module:Article history/config]], [[Template:Icon]]
	Object.assign(icon_to_category, {
		// FFA: 'Wikipedia former featured articles',
		FFL: 'Wikipedia former featured lists',
		FFLC: 'Wikipedia featured list candidates (contested)',
		FGAN: 'Former good article nominees',
		DGA: 'Delisted good articles',
		FPo: 'Wikipedia featured portals',
		FFPo: 'Wikipedia former featured portals',
		FPoC: 'Wikipedia featured portal candidates (contested)',

		// [[Category:All Wikipedia List-Class vital articles]]
		// duplicated with [[Category:List-Class List articles]]
		LIST: 'List-Class List articles',

		// The icons that haven't been traditionally listed
		// (peer review, in the news) might even be unnecessary.
		// PR: 'Old requests for peer review',
		// ITN: 'Wikipedia In the news articles',
		// OTD: 'Article history templates with linked otd dates',
	});
	for (let icon in icon_to_category) {
		const category_name = icon_to_category[icon];
		const pages = await wiki.categorymembers(category_name);
		pages.forEach(page_data => {
			const title = CeL.wiki.talk_page_to_main(page_data.original_title || page_data);
			if (!(title in icons_of_page))
				icons_of_page[title] = [];
			if (icon in synchronize_icon_hash) {
				//List → LIST
				icons_of_page[title].FC = icon.toUpperCase();
			} else {
				icons_of_page[title].push(icon);
			}
		});
	}
	// console.log(icons_of_page);
}

// ----------------------------------------------------------------------------

function level_page_link(level, number_only, page_title) {
	return `[[${page_title || (level === DEFAULT_LEVEL ? base_page : base_page + '/Level/' + level)}|${number_only ? '' : 'Level '}${level}]]`;
}

function level_of_page_title(page_title, number_only) {
	// page_title.startsWith(base_page);
	// [, 1–5, section ]
	const matched = (page_title && page_title.title || page_title).match(/\/Level(?:\/([1-5])(\/.+)?)?$/);
	if (matched) {
		const level = number_only || !matched[2] ? + matched[1] || DEFAULT_LEVEL : matched[1] + matched[2];
		return level;
	}
}

function replace_level_note(item, index, category_level, new_wikitext) {
	if (item.type !== 'plain')
		return;

	const rest_wikitext = item.slice(index + 1).join('').trim();
	const PATTERN_level = /\s*\((?:level [1-5]|\[\[([^\[\]\|]+)\|level [1-5]\]\])\)/i;
	const matched = rest_wikitext && rest_wikitext.match(PATTERN_level);

	if (new_wikitext === undefined) {
		new_wikitext = ` (${level_page_link(category_level, false, matched &&
			//preserve level page. e.g., " ([[Wikipedia:Vital articles/Level/2#Society and social sciences|Level 2]])"
			(category_level === DEFAULT_LEVEL || matched[1] && matched[1].includes(`/${category_level}`)) && matched[1])})`;
	}
	// assert: typeof new_wikitext === 'string'
	// || typeof new_wikitext === 'number'

	// Decide whether we need to replace or not.
	if (new_wikitext ? rest_wikitext.includes(new_wikitext)
		// new_wikitext === '': Remove level note.
		: !matched) {
		return;
	}

	item.truncate(index + 1);
	// _item.push()
	item[index + 1] = rest_wikitext ? rest_wikitext.replace(PATTERN_level, new_wikitext) : new_wikitext;
	return true;
}

async function for_each_list_page(list_page_data) {
	if (CeL.wiki.parse.redirect(list_page_data))
		return Wikiapi.skip_edit;
	if (list_page_data.title.endsWith('/Removed')) {
		// Skip non-list pages.
		return Wikiapi.skip_edit;
	}

	const level = level_of_page_title(list_page_data, true) || DEFAULT_LEVEL;
	// console.log([list_page_data.title, level]);
	const parsed = list_page_data.parse();
	// console.log(parsed);
	parsed.each_section();
	// console.log(parsed.subsections);
	// console.log(parsed.subsections[0]);
	// console.log(parsed.subsections[0].subsections[0]);

	const article_count_of_icon = Object.create(null);

	const need_check_redirected = [];
	let latest_section;

	function simplify_link(link_token, normalized_page_title) {
		// console.log(link_token);
		if (link_token[2]
			// Need avoid [[PH|pH]], do not use
			// wiki.normalize_title(link_token[2].toString())
			&& link_token[2].toString().trim() ===
			// assert: normalized_page_title ===
			// wiki.normalize_title(link_token[0].toString())
			(normalized_page_title || wiki.normalize_title(link_token[0].toString()))) {
			// assert: link_token.length === 3
			link_token.length = 2;
		}
	}

	function for_item(item, index, list) {
		if (item.type === 'list') {
			item.forEach(for_item);
			return;
		}

		let item_wikitext, icons = [];
		function for_item_token(token, index, _item) {
			let parent_of_link;
			if (!item_wikitext && token.type !== 'link') {
				// For token.type 'bold', 'italic', finding the first link
				// children.
				// e.g., `'' [[title]] ''`, `''' [[title]] '''`,
				// `''''' [[title]] '''''`
				parsed.each.call(token, (_token, index, parent) => {
					if (_token.type === 'link') {
						// assert: token.type === 'link'
						token = _token;
						token.index = index;
						parent_of_link = parent;
						return parsed.each.exit;
					}
					if (typeof _token === 'string'
						// e.g., "{{Icon|A}} ''[[title]]''"
						&& !/^['\s]*$/.test(_token)) {
						// Skip links with non-space prefix.
						return parsed.each.exit;
					}
				});
			}
			if (token.type === 'link' && !item_wikitext) {
				// e.g., [[pH]], [[iOS]]
				const normalized_page_title = wiki.normalize_title(token[0].toString());
				simplify_link(token, normalized_page_title);
				if (!(normalized_page_title in listed_article_info)) {
					listed_article_info[normalized_page_title] = [];
				}
				// console.log(latest_section && latest_section.link);
				const subpage = String(level_of_page_title(list_page_data));
				const matched = subpage.match(/^([1-5])(?:\/([^\/]+)(?:\/(.+))?)?$/);
				if (matched) {
					const article_info = {
						level: /*level_of_page_title(list_page_data, true)*/matched[1],
						//subtitle: latest_section && latest_section.link[2].toString().replace(PATTERN_count_mark, '').trim(),
						link: latest_section && latest_section.link
					};
					if (matched[2]) {
						article_info.topic = matched[2];
						if (matched[3])
							article_info.subpage = matched[3];
					}
					listed_article_info[normalized_page_title].push(article_info);
				} else {
					CeL.error(`Invalid level of ${CeL.wiki.title_link_of(list_page_data)}: ${subpage}`);
				}

				if (normalized_page_title in icons_of_page) {
					icons.append(icons_of_page[normalized_page_title]);
				}

				if (normalized_page_title in wiki.FC_data_hash) {
					icons.append(wiki.FC_data_hash[normalized_page_title].types);
				}

				// Good: Always count articles.
				// NG: The bot '''WILL NOT COUNT''' the articles listed in level
				// other than current page to prevent from double counting.
				if (latest_section) {
					latest_section.item_count++;
				}

				const category_level = level_of_page[normalized_page_title];
				// The frist link should be the main article.
				if (category_level === level) {
					// Remove level note. It is unnecessary.
					replace_level_note(_item, index, category_level, '');
				} else {
					// `category_level===undefined`: e.g., redirected
					replace_level_note(_item, index, category_level, category_level ? undefined : '');

					if (false) {
						const message = `Category level ${category_level}, also listed in level ${level}. If the article is redirected, please modify the link manually.`;
					}
					// reduce size
					const message = category_level ? `Category level ${category_level}.{{r|c}}` : 'No VA template?{{r|e}}';
					if (!(category_level < level)) {
						// Only report when category_level (main level) is not
						// smallar than level list in.
						report_lines.push([normalized_page_title, list_page_data, message]);
						if (false) CeL.warn(`${CeL.wiki.title_link_of(normalized_page_title)}: ${message}`);
						// If there is category_level, the page was not
						// redirected.
						if (!category_level) {
							// e.g., deleted; redirected (fix latter);
							// does not has {{`VA_template_name`}}
							// (fix @ maintain_VA_template())
							need_check_redirected[normalized_page_title] = token;
						}
					}
					if (icons.length === 0) {
						// Leave untouched if error with no icon.
						// e.g., unleveled articles
						return true;
					}
				}

				icons = icons.map(icon => {
					if (icon in article_count_of_icon)
						article_count_of_icon[icon]++;
					else
						article_count_of_icon[icon] = 1;
					return `{{Icon|${icon}}}`;
				});

				// This will preserve link display text.
				if (parent_of_link) {
					// replace the [[link]]
					parent_of_link[token.index] = token;
					icons.push(_item[index]);
				} else {
					icons.push(token);
				}

				item_wikitext = icons.join(' ');

				// 前面的全部消除光，後面的原封不動
				// list[index] = item_wikitext;
				_item[index] = item_wikitext;
				if (_item === item)
					_item.splice(0, index);
				return true;
			}

			if (token.type === 'transclusion' && token.name === 'Space'
				|| !token.toString().trim()) {
				// Skip
			} else if (token.type === 'transclusion' && token.name === 'Icon') {
				// reset icon
				// _item[index] = '';

				// There is no category of the icons now, preserve the icon.
				// @see [[Module:Article history/config]], [[Template:Icon]]
				const icon = token.parameters[1];
				if (icon === 'FFAC') {
					icons.push(icon);
				}
			} else if (item_wikitext) {
				// CeL.error('for_item: Invalid item: ' + _item);
				console.log(item_wikitext);
				console.log(token);
				throw new Error('for_item: Invalid item: ' + _item);
			} else {
				if (_item.length !== 1 || typeof token !== 'string') {
					console.log(`Skip from ${index}/${_item.length}, ${token.type || typeof token} of item: ${_item}`);
					// console.log(_item.join('\n'));
					// delete _item.parent;
					// console.log(_item);

					if (false) report_lines.push([normalized_page_title, list_page_data, `Invalid item: ${_item}`]);

					// Fix invalid pattern.
					const wikitext = _item.type === 'plain' && _item.toString();
					let PATTERN;
					if (!wikitext) {
					} else if ((PATTERN = /('{2,5})((?:{{Icon\|\w+}}\s*)+)/i).test(wikitext)) {
						// "{{Icon|B}} '''{{Icon|A}} {{Icon|C}} [[title]]'''" →
						// "{{Icon|B}} {{Icon|A}} {{Icon|C}} '''[[title]]'''"
						_item.truncate();
						_item[0] = wikitext.replace(PATTERN, '$2$1');
					} else if ((PATTERN = /^([^']*)('{2,5}) *(\[\[[^\[\]]+\]\][^']*)$/).test(wikitext)) {
						// "{{Icon|C}} ''' [[title]]" →
						// "{{Icon|C}} '''[[title]]'''"
						_item.truncate();
						_item[0] = wikitext.replace(PATTERN, '$1$2$3$2');
					} else if ((PATTERN = /^([^"]*)" *(\[\[[^\[\]]+\]\]) *"/).test(wikitext)) {
						// `{{Icon|D}} " [[title]]"` →
						// `{{Icon|D}} [[title]]`
						_item.truncate();
						_item[0] = wikitext.replace(PATTERN, '$1$2');
					}
				}

				// Skip to next item.
				return true;
			}
		}

		if (section_text_to_title(item, index, list) || typeof item === 'string') {
			// e.g., ":Popes (3 articles)"
			return;
		}

		if (!item.some) {
			console.error(`No .some() @ ${list_page_data.title}: ${JSON.stringify(item)}`);
		}
		if ((item.type === 'link' ? for_item_token(item, index, list) : item.some(for_item_token)) && !item_wikitext) {
			return parsed.each.exit;
		}

		if (!item_wikitext) {
			throw new Error('No link! ' + list_page_data.title);
		}
	}

	// e.g., [[Wikipedia:Vital articles/Level/4/People]]
	function section_text_to_title(token, index, parent) {
		// assert: token.type !== 'section_title'
		// console.log(token.toString());
		let wikitext = token.toString()
			// "''Pre-Schism (21 articles)''" → "Pre-Schism (21 articles)"
			.replace(/^'''?|'''?$/g, '');
		let next_wikitext;
		// console.log(wikitext + next_wikitext);
		if (PATTERN_counter_title.test(wikitext.trim())
			|| !parent.list_prefix && (next_wikitext = parent[index + 1] && parent[index + 1].toString()
				.replace(/^'''?|'''?$/g, ''))
			// ''Latin America'' (9 articles)
			&& PATTERN_counter_title.test((wikitext += next_wikitext).trim())) {
			// console.log(token);
			const level = '='.repeat(latest_section.level + 1);
			// The bot only update counter in section title. The counter will
			// update next time.
			parent[index] = `\n${level} ${wikitext.trim()} ${level}`;
			if (parent.list_prefix) {
				// remove list item prefix
				parent.list_prefix[index] = '';;
			} else if (next_wikitext) {
				parent[index + 1] = '';
			}
			return true;
		}
	}

	function for_root_token(token, index, root) {
		if (token.type === 'transclusion' && token.name === 'Columns-list') {
			// [[Wikipedia:Vital articles/Level/5/Everyday life/Sports, games
			// and recreation]]
			token = token.parameters[1];
			// console.log(token);
			if (Array.isArray(token)) {
				token.forEach(for_root_token);
			}
			return;
		}

		if (token.type === 'list') {
			token.forEach(for_item);
			return;
		}

		if (token.type === 'section_title') {
			// e.g., [[Wikipedia:Vital articles]]
			if (/See also/i.test(token[0].toString())) {
				return true;
			}
			(latest_section = token).item_count = 0;
			return;
		}

		section_text_to_title(token, index, root);
	}

	parsed.some(for_root_token);

	// -------------------------------------------------------

	function set_section_title_count(parent_section) {
		const item_count = parent_section.subsections.reduce((item_count, subsection) => item_count + set_section_title_count(subsection), parent_section.item_count || 0);

		if (parent_section.type === 'section_title') {
			// $1: Target number
			parent_section[0] = parent_section.join('')
				.replace(PATTERN_count_mark, `(${item_count.toLocaleString()}$1 article${item_count >= 2 ? 's' : ''})`);
			// console.log(parent_section[0]);
			parent_section.truncate(1);
		}

		return item_count;
	}

	const total_articles = `Total ${set_section_title_count(parsed).toLocaleString()} articles.`;
	this.summary += `: ${total_articles}`;
	// console.log(this.summary);

	if (!CeL.is_empty_object(need_check_redirected)) {
		const need_check_redirected_list = Object.keys(need_check_redirected);
		let fixed = 0;
		CeL.info(`${CeL.wiki.title_link_of(list_page_data)}: Check ${need_check_redirected_list.length} link(s) for redirects.`);
		if (need_check_redirected_list.length < 9) {
			console.log(need_check_redirected_list);
		}
		await wiki.for_each_page(need_check_redirected_list, page_data => {
			const normalized_redirect_to = wiki.normalize_title(CeL.wiki.parse.redirect(page_data));
			// Need check if redirects to #section.
			if (!normalized_redirect_to
				// Skip [[Plaster of Paris]]:
				// #REDIRECT [[Plaster#Gypsum plaster]]
				|| normalized_redirect_to.includes('#')) {
				return;
			}

			// Fix redirect in the list page.
			const link_token = need_check_redirected[page_data.title];
			link_token[0] = normalized_redirect_to;
			simplify_link(link_token, normalized_redirect_to);
			fixed++;
		}, { no_edit: true, no_warning: true });
		CeL.debug(`${CeL.wiki.title_link_of(list_page_data)}: ${fixed} link(s) fixed.`, 0, 'for_each_list_page');
	}

	let wikitext = parsed.toString();

	// summary table / count report table for each page
	const summary_table = [['Class', 'Articles']];
	for (let icon in article_count_of_icon) {
		let category_name = icon_to_category[icon];
		if (category_name) {
			category_name = `[[:Category:${category_name}|${icon}]]`;
		} else if (category_name = wiki.get_featured_content_configurations()) {
			category_name = category_name.list_source;
			if (!category_name) {
				CeL.error(`Invalid featured_content_configurations of icon: ${icon}`);
			} else if (category_name = category_name[icon]) {
				if (typeof category_name === 'string')
					category_name = `[[:Category:${category_name}|${icon}]]`;
				else if (category_name && category_name.page)
					category_name = `[[${category_name.page}|${icon}]]`;
				else {
					CeL.error(`Invalid featured_content_configurations: ${JSON.stringify(category_name)}`);
					category_name = null;
				}
			}
		}
		summary_table.push([`{{Icon|${icon}}} ${category_name || icon}`, article_count_of_icon[icon].toLocaleString()]);
	}
	// ~~~~~
	wikitext = wikitext.replace(/(<!-- summary table begin(?::[\s\S]+?)? -->)[\s\S]*?(<!-- summary table end(?::[\s\S]+?)? -->)/, `$1\n${total_articles}\n` + CeL.wiki.array_to_table(summary_table, {
		'class': "wikitable sortable"
	}) + '\n$2');

	//console.trace(`for_each_list_page: return ${wikitext.length} chars`);
	// console.log(wikitext);
	// return Wikiapi.skip_edit;
	return wikitext;
}

// ----------------------------------------------------------------------------

function check_page_count() {
	for (let page_title in level_of_page) {
		const category_level = level_of_page[page_title];
		const article_info_list = listed_article_info[page_title];
		if (!article_info_list) {
			CeL.log(`${CeL.wiki.title_link_of(page_title)}: Category level ${category_level} but not listed. Privious vital article?`);
			// pages that is not listed in the Wikipedia:Vital articles/Level/*
			need_edit_VA_template[page_title] = { level: '' };
			listed_article_info[page_title] = [];
			continue;
		}

		let min_level_info, min_level;
		const listed_level_array = article_info_list.map(article_info => {
			// level maybe `null`
			let level = article_info.level;
			level = typeof level === 'string' && /^[1-5]\//.test(level) ? +level.match(/^[1-5]/)[0] : level || DEFAULT_LEVEL;
			if (!min_level || level < min_level) {
				min_level = level;
				min_level_info = { ...article_info, level };
				// console.log(min_level_info);
			}
			return level;
		});
		if (min_level !== category_level) {
			if (1 <= min_level && min_level <= 5) {
				CeL.log(`${CeL.wiki.title_link_of(page_title)}: level ${category_level}→${min_level}`);
				need_edit_VA_template[page_title] = min_level_info;
			} else {
				CeL.error(`Invalid level of ${CeL.wiki.title_link_of(page_title)}: ${JSON.stringify(article_info_list)}`);
			}
		}

		if (listed_level_array.length <= 3
			// report identifying articles that have been listed twice
			&& listed_level_array.length === listed_level_array.unique().length
			&& listed_level_array.some(level => level === category_level)) {
			delete listed_article_info[page_title];
			continue;
		}
	}

	for (let page_title in listed_article_info) {
		const article_info_list = listed_article_info[page_title];
		if (article_info_list.length > 0) {
			// [contenttoobig] The content you supplied exceeds the article size
			// limit of 2048 kilobytes.
			report_lines.skipped_records++;
			continue;
		}
		report_lines.push([page_title, level_of_page[page_title], article_info_list.length > 0
			? `Listed ${article_info_list.length} times in ${article_info_list.map(article_info => level_page_link(article_info.level))}`
			: `Did not listed in level ${level_of_page[page_title]}.`]);
	}
}

let maintain_VA_template_count = 0;

// maintain vital articles templates: FA|FL|GA|List,
// add new {{Vital articles|class=unassessed}}
// or via ({{WikiProject *|class=start}})
function maintain_VA_template(talk_page_data, main_page_title) {
	const article_info = need_edit_VA_template[main_page_title];
	const parsed = talk_page_data.parse();
	let VA_template, _class;

	/**
	 * scan for existing informations <code>

{{WikiProjectBannerShell|1=
{{WikiProject Video games|class=C|importance=High}}
{{WikiProject Apple Inc.|class=C|ios=yes|ios-importance=High}}
{{WikiProject Apps |class=C|importance=High}}
}}

	 * </code>
	 */
	parsed.each('template', token => {
		if (token.name === VA_template_name) {
			// get the first one
			if (VA_template) {
				CeL.error(`Find multiple {{${VA_template_name}}} in ${CeL.wiki.title_link_of(talk_page_data)}!`);
			} else {
				VA_template = token;
			}
		} else if (token.name.startsWith('WikiProject ') && token.parameters.class) {
			// TODO: verify if class is the same.
			_class = token.parameters.class;
		}
	});
	//console.log([_class, VA_template]);

	let wikitext;
	if (VA_template) {
		wikitext = {
			level: article_info.level,
			class: VA_template.parameters.class || _class || '',
			topic: article_info.topic || VA_template.parameters.topic || '',
			subtitle: article_info.subtitle
		};
		if (article_info.subpage || VA_template.parameters.subpage)
			wikitext.subpage = article_info.subpage || '';
		if (article_info.link)
			wikitext.link = article_info.link.slice(0, 1).join('');
		CeL.wiki.parse.replace_parameter(VA_template, wikitext, 'value_only');
		CeL.info(`${CeL.wiki.title_link_of(talk_page_data)}: ${VA_template.toString()}`);
		wikitext = parsed.toString();
	} else {
		wikitext = `{{${VA_template_name}|level=${article_info.level}|class=${_class || ''}|topic=${article_info.topic || ''}${article_info.link ? '|link=' + article_info.link.slice(0, 1).join('') : ''}}}\n`;
		CeL.info(`${CeL.wiki.title_link_of(talk_page_data)}: Add ${wikitext.trim()}`);
		wikitext += parsed.toString();
	}

	if (true) {
		if (wikitext === talk_page_data.wikitext)
			return Wikiapi.skip_edit;
		if (++maintain_VA_template_count > 2)
			return Wikiapi.skip_edit;
		console.log(wikitext);
	}
	this.summary = talk_page_summary + ': ' + (article_info.level ? 'The article is listed in the level ' + article_info.level + ' page.' : 'The article is not listed in the list page.');
	return wikitext;
}

// ----------------------------------------------------------------------------

async function generate_report() {
	const records_limit = 500;
	if (report_lines.length > records_limit) {
		report_lines.skipped_records += report_lines.length - records_limit;
		report_lines.truncate(records_limit);
	}
	report_lines.forEach(record => {
		const page_title = record[0];
		record[0] = CeL.wiki.title_link_of(page_title);
		if (!record[1]) {
			record[1] = level_of_page[page_title];
		} else if (record[1].title) {
			record[1] = record[1].title;
			const matched = record[1].match(/Level\/([1-5](?:\/.+)?)$/);
			if (matched)
				record[1] = matched[1];
		}
		if (/^[1-5](?:\/.+)?$/.test(record[1])) {
			record[1] = level_page_link(record[1], true);
		}
	});

	const report_count = report_lines.length;
	let report_wikitext;
	if (report_count > 0) {
		report_lines.unshift(['Page title', 'Level', 'Situation']);
		report_wikitext = CeL.wiki.array_to_table(report_lines, {
			'class': "wikitable sortable"
		});
		if (!CeL.is_empty_object(need_edit_VA_template))
			report_wikitext = `* ${Object.keys(need_edit_VA_template).length} talk pages to edit.\n` + report_wikitext;
		if (report_lines.skipped_records > 0)
			report_wikitext = `* Skip ${report_lines.skipped_records.toLocaleString()} records.\n` + report_wikitext;
	} else {
		report_wikitext = "* '''So good, no news!'''";
	}

	await wiki.edit_page(`Wikipedia:Database reports/Vital articles update report`,
		// __NOTITLECONVERT__
		'__NOCONTENTCONVERT__\n'
		+ '* The report will update automatically.\n'
		+ '* If the category level different to the level listed<ref name="c">Category level is different to the level article listed in.</ref>, maybe the article is redirected.<ref name="e">Redirected or no level assigned in talk page. Please modify the link manually.</ref>\n'
		// [[WP:DBR]]: 使用<onlyinclude>包裹更新時間戳。
		+ '* Generate date: <onlyinclude>~~~~~</onlyinclude>\n\n<!-- report begin -->\n'
		+ report_wikitext + '\n<!-- report end -->'
		+ '\n[[Category:Wikipedia vital articles]]', {
		bot: 1,
		nocreate: 1,
		summary: `Vital articles update report: ${report_count + (report_lines.skipped_records > 0 ? '+' + report_lines.skipped_records : '')} records`
	});
}
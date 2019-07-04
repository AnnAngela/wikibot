﻿// cd /d D:\USB\cgi-bin\program\wiki && node 20190629.import_hurricane_track_maps.js

/*

 2019/7/2 17:17:45	初版試營運 modify from 20181016.import_earthquake_shakemap.js

 https://www.metoc.navy.mil/jtwc/jtwc.html
 https://commons.wikimedia.org/wiki/File:JTWC_wp0519.gif

 TODO:
 [[File:01E 2019 5day.png]]
 https://www.nhc.noaa.gov/archive/2019/ONE-E_graphics.php?product=5day_cone_with_line_and_wind

 路徑潛勢預報
 https://www.cwb.gov.tw/V8/C/P/Typhoon/TY_NEWS.html
 暴風圈侵襲機率


 */

// ----------------------------------------------------------------------------
'use strict';

// Load CeJS library and modules.
require('./wiki loader.js');

var fetch = CeL.fetch,
//
data_directory = base_directory + 'data/',
/** {Boolean}若在 media_directory 目錄下已有 cache 檔案就不再 upload。 */
skip_cached = false, media_directory = base_directory + 'media/',
/** {Object}wiki operator 操作子. */
wiki = Wiki(true, 'commons' /* && 'test' */);

var NHC_menu_URL = 'https://www.nhc.noaa.gov/cyclones/';
var parsed_NHC_menu_URL = CeL.parse_URI(NHC_menu_URL);

// ----------------------------------------------------------------------------

// 先創建出/準備好本任務獨有的目錄，以便後續將所有的衍生檔案，如記錄檔、cache 等置放此目錄下。
if (data_directory || media_directory) {
	prepare_directory(base_directory);
	data_directory && prepare_directory(data_directory);
	media_directory && prepare_directory(media_directory);
}

// category_to_parent_hash[category_name] = parent_category_name
// category_to_parent_hash['Category:2019 Pacific typhoon season track maps'] =
// 'Category:2019 Pacific typhoon season'
var category_to_parent_hash = Object.create(null);

[ 'Pacific hurricane season', 'Pacific typhoon season',
		'Atlantic hurricane season', 'Category:Central Weather Bureau ROC' ]
//
.run_async(function(run_next, parent_category_name) {
	if (!parent_category_name.startsWith('Category:'))
		parent_category_name = (new Date).getFullYear() + ' '
				+ parent_category_name;
	wiki.categorymembers(parent_category_name, function(pages, titles, title) {
		pages.forEach(function(page_data) {
			if (page_data.ns === CeL.wiki.namespace('Category')) {
				category_to_parent_hash[page_data.title]
				//
				= parent_category_name;
			}
		});
		run_next();
	}, {
		limit : 'max'
	});
}, function() {
	// console.log(category_to_parent_hash);

	start_NHC();
	// start_JTWC();
	start_CWB();
});

function check_category_exists(category_name) {
	if (!(category_name in category_to_parent_hash))
		CeL.warn('Category does not exist: '
				+ CeL.wiki.title_link_of(category_name));
}

// ============================================================================

// Visit tropical cyclone index page and get the recent tropical cyclones data.
function start_NHC() {
	fetch(NHC_menu_URL).then(function(response) {
		// console.log(response);
		return response.text();

	}).then(function(html) {
		// console.log(html);

		html.each_between(
		//
		'<th align="left" nowrap><span style="font-size: 18px;">',
		//
		'</td></tr></table>', NHC_for_each_area);
	});
}

function parse_NHC_time_string(string) {
	// CeL.info('parse_NHC_time_string: ' + string);
	var date = CeL.DOM.HTML_to_Unicode(string)
	//
	.match(/^(\d{1,2}):?(\d{2}(?: AM| PM)?) (UTC|EDT|PDT|HST) ([a-zA-Z\d ]+)$/);
	if (date) {
		if (!/ 20\d{2}$/.test(date[4]))
			date[4] += ' ' + (new Date).getFullYear();
		date = date[4] + ' ' + date[1] + ':' + date[2] + ' ' + ({
			EDT : 'UTC-4',
			PDT : 'UTC-7',
			HST : 'UTC-10'
		}[date[3]] || date[3]);
		// CeL.info('parse_NHC_time_string: ' + date);
		date = Date.parse(date);
	}
	return date;
}

function NHC_for_each_area(html) {
	var area = html.match(/^[^<\-]*/)[0].trim();
	var date;
	html.each_between('<span class="tiny">', '</span>', function(token) {
		// CeL.info('NHC_for_each_area: ' + token);
		date = date || parse_NHC_time_string(token);
	});

	html.each_between('<!--storm serial number:',
	// <!--storm serial number: EP02-->
	// <!--storm identification: EP022019 Hurricane Barbara-->
	'<!-- END graphcrosslink -->', function(token) {
		NHC_for_each_cyclones(token, area, date);
	});
}

// 有警報才會顯示連結。
// <a href="/refresh/graphics_ep2+shtml/024116.shtml?cone#contents">
//
// <img src="/...png" ... alt="Warnings and 5-Day Cone"><br clear="left">
// Warnings/Cone<br>Static Images</a>
function NHC_for_each_cyclones(token, area, date) {
	// console.log([ token, area, date ]);
	// return;

	var matched = token.between('<strong style="font-weight:bold;">',
			'</strong>');
	if (matched && (matched = parse_NHC_time_string(matched)))
		date = matched;
	var PATTERN_link = /<a href="([^<>"]+)"[^<>]*>([\s\S]+?)<\/a>/g,
	// <!--storm identification: EP022019 Hurricane Barbara-->
	id = token.between('<!--storm identification:', '-->').trim();
	// Get all Tropical Weather Outlook / Hurricane Static Images
	while (matched = PATTERN_link.exec(token)) {
		if (!matched[2].endsWith('Static Images'))
			continue;

		// delete matched.input;
		// console.log(matched);
		var source_URL = parsed_NHC_menu_URL.origin + matched[1];
		var media_data = {
			name : id,
			area : area,
			date : date,
			source_URL : source_URL
		};
		get_NHC_Static_Images(media_data);
	}
}

// ------------------------------------------------------------------

// Visit all "Warnings/Cone Static Images" pages.
function get_NHC_Static_Images(media_data) {
	return fetch(media_data.source_URL).then(function(response) {
		return response.text();
	}).then(parse_NHC_Static_Images.bind(null, media_data));
}

function parse_NHC_Static_Images(media_data, html) {
	var link, media_url = html
	//
	.match(/<img id="coneimage" src *= *"([^<>"]+)"/)[1];
	var file_name = media_url.match(/\/([^\/]+?)\+png\/[^\/]+?\.png$/)[1]
			.replace(/_/g, ' ');
	media_data.date = media_data.date ? new Date(media_data.date) : new Date;

	if (media_data.name) {
		// e.g., id="EP022019 Hurricane Barbara"
		// file_name="EP022019 5day cone no line and wind"
		var matched = media_data.name.match(/^\w*/)[0];
		if (matched && matched === file_name.match(/^\w*/)[0]) {
			file_name = file_name.replace(/^\w*/, media_data.name);
			// e.g., "EP022019 Hurricane Barbara 5day cone no line and wind"
		} else {
			// relief measures 救濟措施 should not go to here
			file_name += ' (' + media_data.name + ')';
			// e.g., "EP022019 5day cone no line and wind (EP022019
			// Hurricane Barbara)"
		}

		link = media_data.name.match(/Hurricane \w+/i);
		if (link) {
			link = link[0] + ' (' + media_data.date.getFullYear() + ')';
			// e.g., "Hurricane Barbara (2019)"
		}
	}
	file_name = media_data.date.format('%4Y-%2m-%2d ') + file_name + '.png';
	media_url = parsed_NHC_menu_URL.origin + media_url;
	// console.log(media_url);

	if (false) {
		CeL.get_URL_cache(media_url, upload_NHC_media, {
			directory : base_directory,
			file_name : file_name,
			reget : true
		});
	}

	var wiki_link = media_data.name ? link ? CeL.wiki.title_link_of(':en:'
			+ link, media_data.name) : media_data.name : '';

	// National Hurricane Center
	var author = '{{label|Q1329523}}';
	Object.assign(media_data, {
		link : link,
		media_url : media_url,
		file_name : file_name,
		author : author,
		license : '{{PD-USGov-NOAA}}',
		description : "{{en|1=The National Hurricane Center's "
		//
		+ "5-day track and intensity forecast cone"
		//
		+ (wiki_link ? ' of ' + wiki_link : '') + '.}}',
		// categories : [ '[[Category:Tropical Depression One-E (2018)]]' ],
		comment : 'Import NHC hurricane track map'
				+ (wiki_link ? ' of ' + wiki_link : '')
	});

	// Fetch the hurricane track maps and upload it to commons.
	upload_NHC_media(media_data);
}

// ------------------------------------------------------------------

function upload_NHC_media(media_data) {
	var track_maps_category = 'Category:' + media_data.date.getFullYear() + ' '
	// Atlantic (- Caribbean Sea - Gulf of Mexico)
	// Eastern North Pacific
	// Central North Pacific
	+ (media_data.area.includes('Pacific') ? 'Pacific' : 'Atlantic')
	// Category:2019 Pacific hurricane season track maps
	+ ' hurricane season track maps';

	var categories = media_data.categories ? media_data.categories.clone() : [];
	categories.push(track_maps_category);
	if (media_data.link)
		categories.push('Category:' + media_data.link);
	categories = categories.map(function(category_name) {
		check_category_exists(category_name);
		// NG: CeL.wiki.title_link_of()
		return '[[' + category_name + ']]';
	});

	// media description
	var upload_text = [
			'== {{int:filedesc}} ==',
			'{{Information',
			'|description='
					+ (Array.isArray(media_data.description) ? media_data.description
							.join('\n')
							: media_data.description),
			'|date=' + media_data.date.toISOString().replace(/\.\d+Z$/, 'Z'),
			'|source=' + (media_data.source_URL || media_data.media_url),
			'|author=' + media_data.author,
			'|permission=' + (media_data.permission || ''),
			'|other_versions=' + (media_data.other_versions || ''),
			// '|other_fields=',

			'}}',
			// {{Object location|0|0}}

			media_data.license ? '\n== {{int:license-header}} ==\n'
					+ media_data.license + '\n' : '',

			// add categories
			categories.join('\n')

	];

	upload_text = upload_text.join('\n');

	// console.log(media_data);
	// console.log(upload_text);
	// return;

	wiki.upload(media_data.media_url, {
		filename : media_data.file_name,
		text : upload_text,
		comment : media_data.comment,
		// must be set to reupload
		ignorewarnings : 1,
		form_data : {
			url_post_processor : function(value, XMLHttp, error) {
				if (media_directory)
					CeL.write_file(media_directory + media_data.file_name,
							XMLHttp.responseText);
			}
		}

	}, function(data, error) {
		console.log(data);
		if (error) {
			CeL.error(
			//
			typeof error === 'object' ? JSON.stringify(error) : error);
			if (data) {
				if (data.warnings) {
					CeL.warn(JSON.stringify(data.warnings));
				} else {
					CeL.warn(JSON.stringify(data));
				}
			}
		}
		// callback();
	});
}

// ============================================================================

function start_CWB() {
	// @see https://www.cwb.gov.tw/V8/assets/js/TY_NEWS.js
	function GetTimeNumber(Number_int) {

		var Number_str = (Number_int < 10) ? "0" + Number_int.toString()
				: Number_int.toString();

		return Number_str;
	}

	var DT = new Date(Date.now() + CeL.to_millisecond('8hr'));
	var DT_Y = DT.getUTCFullYear().toString();
	var DT_M = GetTimeNumber(DT.getUTCMonth() + 1);
	var DT_D = GetTimeNumber(DT.getUTCDate());
	var DT_H = GetTimeNumber(DT.getUTCHours());
	// [RJ] 每10分鐘清除js快取
	var DT_N = Math.floor(DT.getUTCMinutes() / 10).toString();

	var DataTime = DT_Y + DT_M + DT_D + DT_H + "-" + DT_N;
	// console.log(DataTime);

	var typhoon_data, base_URL = 'https://www.cwb.gov.tw/';

	return fetch(
			base_URL
					+ 'Data/typhoon/TY_NEWS/PTA_IMGS_201907040000_zhtw.json?T='
					+ DataTime).then(function(response) {
		return response.text();
	}).then(function(data) {
		typhoon_data = JSON.parse(data);
	}).then(
			function() {
				return fetch(base_URL + 'Data/js/typhoon/TY_NEWS-Data.js?T='
						+ DataTime + '&_=' + Date.now());
			}).then(function(response) {
		return response.text();
	}).then(function(data) {
		return parse_CWB_data(data, typhoon_data, base_URL, DataTime);
	});
}

// ----------------------------------------------------------------------------

function parse_CWB_data(data, typhoon_data, base_URL, DataTime) {
	// console.log(data);

	data = data.replace(/(\nvar +([\w\d]+) ?=)/g, '$1 typhoon_data.$2=');
	try {
		eval(data);
	} catch (e) {
		console.error(e);
		return;
	}

	// https://www.cwb.gov.tw/V8/assets/js/TY_NEWS.js
	// TY_COUNT = [ 熱帶性低氣壓, 颱風 ]

	// https://www.cwb.gov.tw/V8/assets/js/TY_NEWS.js
	function generate_data(data, date, author, VER) {
		var FileLang = {
			'C' : 'zhtw',
			'E' : 'enus'
		};

		// var TY_ID = PTA_JSON.EACH[i].id;
		var TY_ID = data.id;

		var url = base_URL + '/Data/' + typhoon_data.DataPath
		//
		+ 'Download_PTA_' + typhoon_data.TY_DataTime + '_'
		//
		+ TY_ID + '_' + FileLang[VER] + '.png';
		// console.log(url);

		var name = typhoon_data.TYPHOON[data.id].Name[VER];
		var file_name = name + ' track map ('
				+ (VER === 'E' ? 'en-US' : 'zh-TW') + ')';
		return {
			name : name,
			media_url : url,
			file_name : date.format('%4Y-%2m-%2d ') + file_name + '.png',
			// comment won't accept templates
			comment : 'Import CWB typhoon track map of ' + name
		};
	}

	// console.log(typhoon_data);
	typhoon_data.list = typhoon_data.EACH.map(function(data) {
		var name_en = typhoon_data.TYPHOON[data.id].Name.E;
		var date = new Date(typhoon_data.TY_TIME.E);
		// 交通部中央氣象局
		var author = '{{label|Q257136}}';
		var media_data = {
			id : data.id,
			en : generate_data(data, date, author, 'E'),
			zh : generate_data(data, date, author, 'C'),
			date : date,
			author : author,
			permission :
			// @see Category:Earthquake_maps_by_Central_Weather_Bureau_ROC
			'{{GWOIA|url=https://www.cwb.gov.tw/V8/C/information.html'
			//
			+ '|govname=Central Weather Bureau|mingtzu=中央氣象局}}',
			license : '{{Attribution CWB}}' && '',
			area : 'Northwest Pacific',
			// source_URL : base_URL + 'V8/C/P/Typhoon/TY_NEWS.html',
			description : [],
			categories : [
			//
			'Category:Typhoon track maps by Central Weather Bureau ROC' ]
		};

		var footer = media_data.en.name.match(/\((\w+)\)/);
		if (footer) {
			footer = ' ' + CeL.wiki.upper_case_initial(footer[1].toLowerCase())
			// e.g., " Mun (2019)"
			+ ' (' + (new Date).getFullYear() + ')';
			// console.log(footer);
			Object.keys(category_to_parent_hash)
			// e.g., [[Category:Tropical Storm Mun (2019)]]
			.some(function(category_name) {
				if (category_name.endsWith(footer)) {
					// Will be auto-added
					// media_data.categories.push(category_name);
					media_data.link = category_name.replace('Category:', '');
					return true;
				}
			});
		}

		return media_data;
	});

	typhoon_data.note = [ {
		C : typhoon_data.TY_LIST_1.C,
		E : typhoon_data.TY_LIST_1.E
	}, {
		C : typhoon_data.TY_LIST_2.C,
		E : typhoon_data.TY_LIST_2.E
	} ];

	var index;
	index = 0;
	typhoon_data.note[0].C.each_between('<div id="collapse-A', null,
	//
	function(token) {
		var name = typhoon_data.list[index].zh.name;
		typhoon_data.list[index++].description.push('{{zh-tw|' + name
		//
		+ token.between('>').replace(/<\/?\w[^<>]*>/g, '')
		//
		.replace(/\s{2,}/g, ' ') + '}}');
	});
	index = 0;
	typhoon_data.note[0].E.each_between('<div id="collapse-A', null,
	//
	function(token) {
		var name = typhoon_data.list[index].en.name;
		typhoon_data.list[index++].description.push('{{en|' + name + ': '
		//
		+ token.between('>').replace(/<\/?\w[^<>]*>/g, '')
		//
		.replace(/\s{2,}/g, ' ') + '}}');
	});

	// console.log(typhoon_data.TY_LIST_1);
	// console.log(JSON.stringify(typhoon_data.TY_LIST_1));
	CeL.write_file(data_directory + 'CWB_' + DataTime + '.json',
	//
	JSON.stringify(typhoon_data));

	typhoon_data.list.forEach(function(media_data) {
		Object.assign(media_data, media_data.en, {
			other_versions : '{{F|' + media_data.zh.file_name
					+ '|Chinese version|80}}'
		});
		upload_NHC_media(media_data);
		Object.assign(media_data, media_data.zh, {
			other_versions : '{{F|' + media_data.en.file_name
					+ '|English version|80}}'
		});
		upload_NHC_media(media_data);
	});
}

// ------------------------------------------------------------------

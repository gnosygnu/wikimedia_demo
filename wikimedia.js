/*
  Given a domain and a category, list its member pages and readability score
  EX: http://xowa.org/wikimedia.html?domain=en.wikipedia.org&page=Earth
*/
(function (wm) {
  wm.category = new function() {
    // **********************************************
    // member variables
    // **********************************************
    // test mode
    this.production = true;
    
    // wikimedia domain; EX: en.wikipedia.org
    this.domain = 'en.wikipedia.org';

    // array of categories
    this.categories = [];
    
    // number of pages in category
    this.categoriesTotal = 0;

    // number of excerpts found
    this.excerptsFound = 0;

    // maximum number of excerpts to find
    this.excerptsMax = 50;
    
    // **********************************************
    // main entry function
    // **********************************************
    this.run = function() {
      setTimeout(function() {
        // parse url to get domain and page
        var url = window.location.href;
        var domain = wm.category.getQueryArg(url, 'domain');
        var category = wm.category.getQueryArg(url, 'category');
        
        // use domain arg if available; otherwise use default
        if (domain)
          wm.category.domain = domain;
        
        // find pages in category
        wm.category.findPagesInCategory(wm.category.domain, category);
      }, 100);
    }

    this.getQueryArg = function(url, name) {
      // REF: http://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript
      if (!url) {
        url = window.location.href;
      }
      name = name.replace(/[\[\]]/g, "\\$&");
      var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
          categories = regex.exec(url);
      if (!categories) return null;
      if (!categories[2]) return '';
      return decodeURIComponent(categories[2].replace(/\+/g, " "));
    }

    // **********************************************
    // find page in category
    // **********************************************
    this.findPagesInCategory = function(domain, category) {
      // run ajax; NOTE: must specify origin to bypass CORS; http://stackoverflow.com/a/38921370
      if (wm.category.production) {
        var url = 'https://' + domain + '/w/api.php?action=query&format=json&formatversion=2&origin=*&list=categorymembers&cmlimit=' + wm.category.excerptsMax + '&cmtitle=Category:' + category;
        wm.category.runAjax(url, wm.category.findPagesInCategoryCallback);      
      }
      else {      
      // var root = {"query":{"categorymembers":[{"pageid":9228,"ns":0,"title":"Earth"},{"pageid":51506837,"ns":0,"title":"Outline of Earth"},{"pageid":25287133,"ns":0,"title":"Anywhere on Earth"},{"pageid":174069,"ns":0,"title":"Asteroid impact avoidance"},{"pageid":35971482,"ns":0,"title":"Day length fluctuations"},{"pageid":33256286,"ns":0,"title":"Demographics of the world"},{"pageid":19509955,"ns":0,"title":"Earth in culture"},{"pageid":212485,"ns":0,"title":"Earth religion"},{"pageid":944638,"ns":0,"title":"Earth's energy budget"},{"pageid":41077022,"ns":0,"title":"Earth's internal heat budget"}]}};
        var root = {"query":{"categorymembers":[{"pageid":9228,"ns":0,"title":"Earth"}]}};
        wm.category.findPagesInCategoryCallbackRoot(root);
      }
    }

    this.findPagesInCategoryCallback = function() {
      if (this.readyState != 4 || this.status != 200) return;
      wm.category.findPagesInCategoryCallbackRoot(JSON.parse(this.responseText));
    }

    this.findPagesInCategoryCallbackRoot = function(root) {
      // loop each page in category
      var categorymembers = root.query.categorymembers;
      for (var categoryIndex in categorymembers) {
        // get category
        var category = categorymembers[categoryIndex];
        
        // get member vars
        var page_id = category.pageid;
        var ns = category.ns;
        var title = category.title;
        
        // populate local categories table
        wm.category.categories[page_id] = category;
        
        // increment total
        wm.category.categoriesTotal++;
        
        // assign score
        category.score = 'N/A';
      }
      
      // now, get excerpts
      wm.category.getExcerpts();
    }

    // **********************************************
    // get excerpts    
    // **********************************************
    this.getExcerpts = function() {
      // loop each page to get excerpt
      var excerptsCount = 0;
      for (var page_id in wm.category.categories) {
        var category = wm.category.categories[page_id];

        // exit if too many
        if (excerptsCount++ >= wm.category.excerptsMax) {
          // NOTE: must update categoriesTotal
          wm.category.categoriesTotal = wm.category.excerptsMax;
          break;
        }
        
        // run ajax; NOTE: must specify origin to bypass CORS; http://stackoverflow.com/a/38921370
        if (wm.category.production) {
          var url = 'https://' + wm.category.domain + '/w/api.php?action=query&format=json&formatversion=2&origin=*&prop=extracts&exintro=1&explaintext&titles=' + category.title;
          wm.category.runAjax(url, wm.category.getExcerptCallback);
        }
        else {
          var root = {"query":{"pages":
          [
           {"pageid":9228,"ns":0,"title":"Earth","extract":"Earth (Greek: Γαῖα Gaia; Latin: Terra)."}
          ]}};
          wm.category.getExcerptCallbackRoot(root);
        }
      }
    }
    this.getExcerptCallback = function() {
      if (this.readyState != 4 || this.status != 200) return;

      var root = JSON.parse(this.responseText);
      wm.category.getExcerptCallbackRoot(root);
    }
    this.getExcerptCallbackRoot = function(root) {
      // get variables
      var page = root.query.pages[0]; // only 1 page per api call
      var page_id = page.pageid;
      var excerpt = page.extract;
    
      // calc readability score
      var score = wm.category.calcReadabilityScore(page.title, excerpt);
      
      // update local category
      var category = wm.category.categories[page_id];
      category.excerpt = excerpt;
      category.score = score[0];
      category.totalSentences = score[1];
      category.totalWords = score[2];
      category.totalSyllables = score[3];
      if (!category.score)
        console.log(JSON.stringify(category));
      
      // if last category, print all
      if (++wm.category.excerptsFound == wm.category.categoriesTotal) {
        wm.category.printResults();        
      }
    }
    
    // **********************************************
    // calc readability
    // **********************************************
    this.calcReadabilityScore = function(title, s) {
      // REF: https://en.wikipedia.org/wiki/Flesch–Kincaid_readability_tests
      
      // count words and sentences
      var words = wm.category.toWordArray(s);
      if (words.length == 1) return [999, 0, 0, 0];
      var totalWords = words.length;
      var totalSentences = wm.category.countSentences(s);
      
      // count syllables
      var totalSyllables = 0;
      var wordsLength = words.length;
      for (var i = 0; i < wordsLength; i++) {
        totalSyllables += wm.category.countSyllablesInWord(words[i]);
      }

      // calc score: again, see https://en.wikipedia.org/wiki/Flesch–Kincaid_readability_tests
      var score = 206.835 - (1.015 * (totalWords / totalSentences)) - (84.6 * (totalSyllables / totalWords));
      return [score, totalSentences, totalWords, totalSyllables];
    }
    
    this.toWordArray = function(s){
      // REF: http://stackoverflow.com/a/18679657
      s = s.replace(/(^\s*)|(\s*$)/gi,"");//exclude  start and end white-space
      s = s.replace(/[ ]{2,}/gi," ");//2 or more space to 1
      s = s.replace(/\n /,"\n"); // exclude newline with a start spacing
      return s.split(' '); 
    }
    
    this.countSentences = function(s) {
      // REF: http://stackoverflow.com/questions/35215348/count-sentences-in-string-with-javascript
      var replaced = s.replace(/\w[.?!](\s|$)/g, "$1|");
      var arr = replaced.split("|");
      var arr_len = arr.length;
      var count = 0;
      for (var i = 0; i < arr_len; i++) {
        var sentence = arr[i];
        sentence = sentence.trim(); // remove any whitespace        
        // ignore 0 length sentences; note that "Yes." will become ["Yes", ""] so 2nd needs to be ignored
        if (sentence.length == 0) continue;

        // add back acronyms; 5 is a heuristic for maximum length of acronym
        if (sentence.length < 5) {
          // ignore; NOTE: not handling "Words U.S.A." will break up into ["Words U", "S", "A"]; 
        }
        else {
          count++;
        }
      }
      return count;
    }
    
    this.countSyllablesInWord = function(word) {
      // REF: http://stackoverflow.com/questions/5686483/how-to-compute-number-of-syllables-in-a-word-in-javascript      
      word = word.toLowerCase();                                   //word.downcase!
      if(word.length <= 3) {return 1;}                             //return 1 if word.length <= 3
      word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, ''); //word.sub!(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
      if (word == null) return 1;
      
      word = word.replace(/^y/, '');                               //word.sub!(/^y/, '')
      if (word == null) return 1;
      
      word = word.match(/[aeiouy]{1,2}/g);                         //word.scan(/[aeiouy]{1,2}/).size    
      return word == null ? 1 : word.length;
    }
    
    // **********************************************
    // printResults
    // **********************************************
    this.printResults = function() {
      // sort results by score
      wm.category.categories.sort(wm.category.compareResult);
            
      // generate string
      var s 
        = '<div class="results_div">\n'
        + '  <div class="result_div">\n'
        + '    <div class="result_title result_header">Title</div>\n'
        + '    <div class="result_score result_header">Score</div>\n'
        + '  </div>'
        ;
      for (var page_id in wm.category.categories) {
        var category = wm.category.categories[page_id];
        
        // get category_title for url
        var page_enc = category.title.replace(/ /g, '_');
        page_enc = encodeURI(page_enc);
        
        // get score
        var score = category.score;
        if (score === 999) {
          score = 'N/A';
        }
        else {
          score = score.toFixed(2);
        }
        
        s += '  <div class="result_div">\n'
          +  '    <div class="result_title tooltip"><a href="https://' + wm.category.domain + '/wiki/' + page_enc + '">' + category.title + '</a>\n'
          +  '      <span class="tooltiptext">\n' 
          +  '        Sentences: ' + category.totalSentences + '<br/>\n' 
          +  '        Words: ' + category.totalWords + '<br/>\n' 
          +  '        Syllables: ' + category.totalSyllables + '<br/>\n' 
          +  '        <br/>\n' 
          +           category.excerpt
          +  '      </span>\n' 
          +  '    </div>\n'
          +  '    <div class="result_score">' + score + '</div>\n'
          +  '  </div>\n';
      }
      s += '</div>';
      
      // print string
      document.body.innerHTML = s;
    }
    this.compareResult = function(lhs, rhs) {
      // sort from least readable to most readable
      return (lhs.score - rhs.score);
    }
    
    // **********************************************
    // utility
    // **********************************************
    this.runAjax = function(url, callback) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.onreadystatechange = callback;
      xhr.send();      
    }
  }
}(window.wm = window.wm || {}));

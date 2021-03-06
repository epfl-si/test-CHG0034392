'use strict';

const assert = require('chai').assert,
      expect = require('chai').expect,
      got = require('got'),
      http = require('http'),
      net = require('net'),
      tls = require('tls'),
      url = require('url'),
      _ = require('lodash'),
      agent = require('agent-base'),
      stringSimilarity = require('string-similarity'),
      debug = require('debug')('a10-config-test');

/**
 * @return {http.Agent} An agent that always connects to connectTo.
 */
function agentThatConnectsTo(connectTo) {
    return agent(function(req, opts) {
        const socket = new net.Socket();
        socket.connect(443, connectTo);
        return tls.connect(_.extend({
            socket,
            rejectUnauthorized: false
        }, opts));
    })
}

let _oldAgent = agentThatConnectsTo('128.178.222.108');
let _newAgent = agentThatConnectsTo('128.178.222.7');

function gotOld(uri) { return _got(_oldAgent, '_oldAgent', uri); }
function gotNew(uri) { return _got(_newAgent, '_newAgent', uri); }


async function _got(agent, nameForDebug, uri) {
    const qualifiedUrl = new url.URL(uri, 'https://www.epfl.ch');
    function debugThisRequest (msg) {
        debug(nameForDebug + ' at ' + qualifiedUrl.href + ': ' + msg);
    }

    try {
        debugThisRequest('starting');
        const response = await got(qualifiedUrl.href, {
            agent,
            throwHttpErrors: false,
            followRedirect: false,
            headers: {
                host: "www.epfl.ch",  // # Y U NO
                cookie: "wordpress_logged_in_whatever: notReally"
            }
        });
        debugThisRequest('returned status code ' + response.statusCode);
        return response;
    } catch (e) {
        debugThisRequest('failed with ' + e);
        throw e;
    }
}

async function assertServesAsBefore (uri) {
    const oldResponse = await gotOld(uri),
          newResponse = await gotNew(uri);
    assert.equal(oldResponse.statusCode, newResponse.statusCode);
    assert.equal(oldResponse.headers.location, newResponse.headers.location);
    if (stringSimilarity.compareTwoStrings(oldResponse.body, newResponse.body) < 0.95) {
        assert.equal(oldResponse.body, newResponse.body);  // For the diff
    }
    return newResponse;
}

async function assertDoesNotServeAsBefore (uri) {
    const oldResponse = await gotOld(uri),
          newResponse = await gotNew(uri);
    const similarity = stringSimilarity.compareTwoStrings(
        oldResponse.body, newResponse.body);
    assert(similarity < 0.8, 'similarity is ' + similarity);
    return newResponse;
}

function assertLooksLikeWordpressResponse(res) {
    expect(res.body).to.not.include('<script type="text/javascript" src="/public/hp2013/');
    if (res.statusCode === 301) {
        // Redirects are hard to figure out. Trust the Varnish version
        expect(res.headers.via).to.include('Varnish/5.1');
    } else if (res.statusCode === 403 && res.body.includes('<h1 class="page-title">Access Denied</h1>')) {
        // Weird /global/403.php gonna weird /global/403.php
    } else {
        expect(res.body).to.not.include('scripts/epfl-jquery-built.js');
        expect(res.body).to.include('wp-json');
    }
}

describe('New A10 config @ 128.178.222.7', async function() {
    this.timeout(20000);
    it('serves www.epfl.ch the same as before', async function() {
        let res = await assertServesAsBefore('/');
        assertLooksLikeWordpressResponse(res);
    });

    it('serves www.epfl.ch/zonk out of WordPress', async function() {
        let res = await assertDoesNotServeAsBefore('/zonk');
        assertLooksLikeWordpressResponse(res);
    });

    it('serves /?foo7 out of WordPress', async function() {
        const res = await assertDoesNotServeAsBefore('/?foo7');
        assertLooksLikeWordpressResponse(res);
    });
    it('serves /index and friends out of WordPress', async function() {
        const res1 = await assertDoesNotServeAsBefore('/index'),
              res2 = await assertDoesNotServeAsBefore('/index.en');
        assertLooksLikeWordpressResponse(res1);
        assertLooksLikeWordpressResponse(res2);

        const res = await assertServesAsBefore('/index.fr.html');
        assertLooksLikeWordpressResponse(res);
    });

    // Straight from https://docs.google.com/document/d/1O77LvuFBOhoUjNBYLuMQJZnojvWGOp9_KquZ0lz0tGw/edit#bookmark=id.3s5lrsb38jz3 :
    it('serves _vti_bin the same as before', async function() {
        await assertServesAsBefore('/_vti_bin/');
        await assertServesAsBefore('/_vti_bin/?zonzon');
        await assertServesAsBefore('/_vti_bin');
    });

    it('serves /accessibility and friends same as before',
       async function() {
           await assertServesAsBefore('/accessibility');
           await assertServesAsBefore('/accessibility.en');
           await assertServesAsBefore('/accessibility.en.shtml');
           await assertServesAsBefore('/accessibility.fr');
           await assertServesAsBefore('/accessibility.fr.shtml');
       });
    it('serves /cgi-bin/ out of WordPress', async function() {
        const res1 = await assertDoesNotServeAsBefore('/cgi-bin'),
              res2 = await assertDoesNotServeAsBefore('/cgi-bin/');
        assertLooksLikeWordpressResponse(res1);
        assertLooksLikeWordpressResponse(res2);
    });
    it('serves /cgi-bin/csoldap out of the original Homepage',
       async function() {
           await assertServesAsBefore('/cgi-bin/csoldap?sciper=289976');
       });
    it('serves /cgi-bin/new as before',
       async function() {
           await assertServesAsBefore('/cgi-bin/new/switch2003?name=pierre+etienne');
           await assertServesAsBefore('/cgi-bin/new/csoldap?server=ldap.epfl.ch&sciper=104359');
       })
    it('serves /css as before', async function() {
        await assertServesAsBefore('/css/syntaxhighlighter/shCore.css');
    });

    it('serves /errors as before', async function() {
        const res = await assertServesAsBefore('/errors/404.fr.shtml');
        assert.equal(200, res.statusCode);
    });

    it('serves /img and /images as before', async function() {
        await assertServesAsBefore('/img/arrow-menu-on.gif');
        await assertServesAsBefore('/images/epfl_logo.gif');
    });

    it('serves /javascript-help and friends same as before',
       async function() {
           await assertServesAsBefore('/javascript-help');
           await assertServesAsBefore('/javascript-help.en');
           await assertServesAsBefore('/javascript-help.en.shtml');
           await assertServesAsBefore('/javascript-help.fr');
           await assertServesAsBefore('/javascript-help.fr.shtml');
       });

    it('serves /js as before', async function() {
        await assertServesAsBefore('/js/syntaxhighlighter/shCore.js?_=1543939081598');
    });

    it('serves /navigate and friends same as before',
       async function() {
           await assertServesAsBefore('/navigate');
           await assertServesAsBefore('/navigate.en');
           await assertServesAsBefore('/navigate.en.shtml');
           await assertServesAsBefore('/navigate.fr');
           await assertServesAsBefore('/navigate.fr.shtml');
       });

    it('serves /organigrammes as before', async function() {
        await assertServesAsBefore('/organigrammes/exportchart.do?acronym=STI&lang=fr');
    });

    it('serves /templates as before', async function() {
        await assertServesAsBefore('/templates/schools/sti.html');
    });
    it('serves /tools as before', async function() {
        await assertServesAsBefore('/tools/label.php?FG=FFFFFF&BG=336699&label=LPHE%20-%20Publications%20-%202000&s=14');
    });
});

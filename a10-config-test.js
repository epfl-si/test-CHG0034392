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
    const oldReq = await gotOld(uri),
          newReq = await gotNew(uri);
    if (stringSimilarity.compareTwoStrings(oldReq.body, newReq.body) < 0.95) {
        assert.equal(oldReq.body, newReq.body);  // For the diff
    }
    return newReq;
}

async function assertDoesNotServeAsBefore (uri) {
    const oldReq = await gotOld(uri),
          newReq = await gotNew(uri);
    const similarity = stringSimilarity.compareTwoStrings(
        oldReq.body, newReq.body);
    assert(similarity < 0.8, 'similarity is ' + similarity);
    return newReq;
}

function assertLooksLikeWordpressResponse(res) {
    expect(res.body).to.not.include('<script type="text/javascript" src="/public/hp2013/');
    expect(res.body).to.not.include('scripts/epfl-jquery-built.js');
    expect(res.body).to.include('wp-json');
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

    it('serves _vti_bin the same as before', async function() {
        await assertServesAsBefore('/_vti_bin/');
        await assertServesAsBefore('/_vti_bin/?zonzon');
        await assertServesAsBefore('/_vti_bin');
    });

    it('serves /javascript-help and friends out of WordPress',
       async function() {
        const res = await assertDoesNotServeAsBefore('/javascript-help');
        assertLooksLikeWordpressResponse(res);
       });

    it('serves /?foo7 out of WordPress', async function() {
        const res = await assertDoesNotServeAsBefore('/?foo7');
        assertLooksLikeWordpressResponse(res);
    });
    it('serves /cgi-bin/ out of WordPress', async function() {
        const res = await assertDoesNotServeAsBefore('/cgi-bin/');
        assertLooksLikeWordpressResponse(res);
    });
    it('serves /cgi-bin/csoldap out of the original Homepage');
});

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
      stringSimilarity = require('string-similarity');

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

let _oldAgent = agentThatConnectsTo('128.178.222.7');
let _newAgent = agentThatConnectsTo('128.178.222.108');

function gotOld(uri) { return _got(_oldAgent, '_oldAgent', uri); }
function gotNew(uri) { return _got(_newAgent, '_newAgent', uri); }


async function _got(agent, nameFOrDebug, uri) {
    const qualifiedUrl = new url.URL(uri, 'https://www.epfl.ch');
    try {
        return await got(qualifiedUrl, { agent, throwHttpErrors: false });
    } catch (e) {
        console.log('Failed for agent ' + nameForDebug);
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
    assert(stringSimilarity.compareTwoStrings(oldReq.body, newReq.body) < 0.5);
    return newReq;
}

describe('New A10 config @ 128.178.222.7', async function() {
    it('serves www.epfl.ch the same as before', async function() {
        await assertServesAsBefore('/');
    });
    it('serves _vti_bin the same as before', async function() {
        await assertServesAsBefore('/_vti_bin/');
        await assertServesAsBefore('/_vti_bin/?foo=bar');
        await assertServesAsBefore('/_vti_bin');
    });

    it('serves /?foo=bar out of WordPress', async function() {
        const res = await assertDoesNotServeAsBefore('/?foo=bar');
        expect(res.body).to.not.include('<script type="text/javascript" src="/public/hp2013/');
    });
    it('serves /cgi-bin out of WordPress');
    it('serves /cgi-bin out of WordPress');
});

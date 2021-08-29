import axios from 'axios';
import axiosCookieJarSupport from 'axios-cookiejar-support';
import {CookieJar} from 'tough-cookie';
import parser from 'node-html-parser';
import fs  from 'fs/promises';
import { constants } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';


const {parse} = parser;

axiosCookieJarSupport.default(axios);

/**
 * 
 * @param {string} username 
 * @param {string} password 
 * @returns 
 */
const getNewCookie = async (username, password) => {
    const cookieJar = new CookieJar();
    const axiosOptions = {
        jar: cookieJar, // tough.CookieJar or boolean
        withCredentials: true, // If true, send cookie stored in jar
        ignoreCookieErrors: true,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
        }
    }
    
    let response = await axios.get(
        'http://online.tivo.com/start/watch/JustForMeTVE?forceAuth=1', 
        axiosOptions
    );
    let dom = parse(response.data);
    const form = dom.querySelector('form');
    const SAMLRequest = form.querySelector("input[name='SAMLRequest']");
    const RelayState = form.querySelector("input[name='RelayState']");
    const SamlPostUrl = /action="([^"]*)"/.exec(form.rawAttrs);
    var params = new URLSearchParams([["SAMLRequest", SAMLRequest.attrs.value], ["RelayState", RelayState.attrs.value]]);
    
    try {
        response = await axios.post(
            SamlPostUrl[1],
            params,
            {
                maxRedirects: 0,
                ...axiosOptions
            }
        );
    } catch (e) {
        if (e.response.status !== 302) {
            throw e;
        }
        
        
        response = await axios.get(
            e.response.headers.location,
            axiosOptions
        );
    }

    const auraConfigMatch =/auraConfig = ([^;]*);/.exec(response.data)
    const auraConfig = JSON.parse(auraConfigMatch[1]);
    
    const auth = {
        "actions":[{
            "id":"87;a",
            "descriptor":"apex://Tivo_idp_LightningLoginFormController/ACTION$login",
            "callingDescriptor":"markup://c:tivo_idp_login_form",
            "params": {
                "username":username,
                "password":password,
                "startUrl":"[\"startURL=/idp/login?app=0sp380000004COf\"]",
                "relayState":"binding=HttpPost"
            }
        }]};
        
    const url = new URL(response.config.url);
    const pageURI = url.pathname + url.search;
    const context = {"mode":"PROD","fwuid":auraConfig.context.fwuid,"app":"siteforce:loginApp2","loaded":auraConfig.context.loaded,"dn":[],"globals":{},"uad":false};
    
    var params = new URLSearchParams([
        ['message', JSON.stringify(auth)],
        ['aura.context', JSON.stringify(context)],
        ['aura.pageURI', pageURI],
        ['aura.token', 'undefined'],
    ]);
    url.search = '?r=1&other.Tivo_idp_LightningLoginForm.login=1';
    url.pathname = '/s/sfsites/aura';
    try {
        response = await axios.post(
            url.href,
            params,
            {
                ...axiosOptions
            }
        );
    } catch (e) {
        console.log(e);
    }

    //frontdoor.jsp?allp=1&apv=1&cshc=00000000000000&refURL=https%3A%2F%2Ftivoidp.tivo.com%2Fsecur%2Ffrontdoor.jsp&
    let frontdoor = '';
    if (response.data.events && response.data.events[0] && response.data.events[0].attributes && response.data.events[0].attributes.values && response.data.events[0].attributes.values.url) {
        frontdoor = response.data.events[0].attributes.values.url;
        response = await axios.get(
            response.data.events[0].attributes.values.url,
            {
                ...axiosOptions
            }
        );
    } else {
        if (response.data.actions && response.data.actions[0] && response.data.actions[0].returnValue) {
            throw Error( response.data.actions[0].returnValue)
        }
        throw Error('failed to get URL ' + JSON.stringify(response.data))
    }

    ///idp/login?app=0000000000000&binding=HttpPost
    let matches = /window\.location\.href="([^"]*)"/.exec(response.data);

    response = await axios.get(
        url.origin + matches[1],
        {
            maxRedirects: 0,
            ...axiosOptions
        }
    );

    dom = parse(response.data);
    const rform = dom.querySelector('form');
    const SAMLResponse = rform.querySelector("input");
    const rSamlPostUrl = /action="([^"]*)"/.exec(rform.rawAttrs);

    var params = new URLSearchParams([["SAMLResponse", SAMLResponse.attrs.value]]);
    
    try {
        response = await axios.post(
            rSamlPostUrl[1],
            params,
            {
                ...axiosOptions,
            }
        );
    } catch(e) {
        console.log(e);
    }

    const cookies = cookieJar.getCookiesSync('https://online.tivo.com/');
    const domainTokenCookie =  cookies.find((c) => c.key === 'domainToken');
    return {
        token:  domainTokenCookie.value,
        expires: domainTokenCookie.expires.getTime()
    }
}

/**
 * throws an error if the token is not valid.  If it is valid it will return a json array of tsn's
 * @param {string} domainToken 
 */
export const getBodyId = async (domainToken) => {
    const cookieJar = new CookieJar();
    const axiosOptions = {
        jar: cookieJar, // tough.CookieJar
        withCredentials: true, // If true, send cookie stored in jar
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
        }
    }
    cookieJar.setCookieSync('domainToken=' + domainToken, 'https://online.tivo.com/');

    let response = await axios.get(
        'https://online.tivo.com/body/global/selectors', 
        axiosOptions
    );

    return response.data;
}


const cache = path.dirname(fileURLToPath(import.meta.url)) + `${path.sep}..${path.sep}.domainTokens.js`;

/**
 * 
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<string>} domainToken
 */
export const getDomainToken = async (username, password) => {
    let cacheStore = {};
    let domainToken = null;
    try {
        await fs.access(cache, constants.R_OK | constants.W_OK);
        const cachedStr = await fs.readFile(cache);
        cacheStore = JSON.parse(cachedStr);


        if (cacheStore[username] && cacheStore[username].expires && cacheStore[username].expires > Date.now()) {
            await getBodyId(cacheStore[username]);
            return cacheStore[username];
        }
    } catch (e) {
        console.error(e);
    }

    domainToken = await getNewCookie(username, password);
    cacheStore[username] = domainToken;
    try {
        await fs.writeFile(cache, JSON.stringify(cacheStore));
    } catch (e) {
    }
    if (domainToken) {
        return domainToken;
    }
    throw Error('Failed to get Domain token');
}
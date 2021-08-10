'use strict'
import tls from 'tls';
import fs from 'fs';

export class Tivo {
    /**
     * 
     * @param {string} ip Tivo ip address
     * @param {string} mak media access key
     */
    constructor(ip, mak) {
        this.rpcId = 0;
        this.ip = ip;
        this.mak = mak;
    }

    async connect () {
        const options = {
            host : this.ip,
            rejectUnauthorized: false,
            port : 1413,
            pfx : fs.readFileSync('cdata.p12'),
            passphrase : fs.readFileSync('cdata.password'),
        };

        this.sessionID = Math.floor(Math.random() * 72736 + 2539520).toString(16);

        const promise = new Promise((resolve, reject) => {
            this.received = resolve;
            this.socket = tls.connect(options, () => {
                this.socket.setEncoding('utf8');
                this.socket.write(this.buildRequest("bodyAuthenticate", {"type":"bodyAuthenticate","credential":{"type":"makCredential","key":this.mak}}));
                
                this.data = "";

                this.socket.on('data', this.read.bind(this));

                this.socket.on('error', (err) => {
                    console.error('TIVO TLS error', err);
                    this.socket.end();
                });
            });
        });

        const response = await promise;
        this.received = null;

        const bodyResponse = await this.sendRequest('bodyConfigSearch', {"bodyId": "-"});
        this.bodyId = bodyResponse.bodyConfig[0].bodyId;
    }

    async sendRequestAllPages(type, content, responseKey, count = 50) {
        content.count = 50;
        let response = await this.sendRequest(type, content);
        let combinedResponse = response;
        let offset = count;
        while (response.isBottom === false) {
            content.offset = offset;
            console.log(offset);
            offset += count;
            response = await this.sendRequest(type, content);
            combinedResponse[responseKey] = combinedResponse[responseKey].concat(response[responseKey]);
        }
        return combinedResponse;
    }

    async sendRequest(type, content) {
        if (this.received) {
            await this.received;
        }

        this.bodyLength = null;
        this.body = null;
        this.data = null;

        const request = this.buildRequest(type, content);
        //console.log(request);
        const promise = new Promise((resolve, reject) => {
            this.received = resolve;
            this.socket.write(request)
        });

        const response = await promise;
        this.received = null;
        //console.log(response);
        const responseBody = JSON.parse(response);

        if (responseBody.type === 'error') {
            throw new Error(response);
        }

        return responseBody;
    }

    disconnect() {
        this.socket.end();
    }

    /**
     * used for callbaks don't use
     * @param {string} chunk 
     */
    read(chunk) {
        if (chunk.indexOf('MRPC/2 ') === 0) {
            const header = chunk.split("\r\n")[0];
            this.bodyLength = parseInt(header.split(" ")[2], 10);
            this.body = chunk.split("\r\n\r\n")[1];
            this.chunkCount = 1;
        } else if (this.bodyLength) {
            this.chunkCount++;
            this.body += chunk;
        }
        this.data += chunk;
        // I don't know why this.body.length does not match this.bodyLength some times. this can lead to a hang as the promise will never resolve.
        if (this.received && this.body && this.body.length >= this.bodyLength - this.chunkCount) {
            this.received(this.body);
        }
    }


    /**
     * 
     * @param {string} type 
     * @param {object} content 
     * @returns {string}
     */
    buildRequest(type, content) {
        content.type = type;
        if (!content.bodyId && this.bodyId) {
            content.bodyId = this.bodyId;
        }
        const eol = "\r\n";
        const header = "Type: request" + eol +
            `RpcId: ${this.rpcId++}` + eol +
            "SchemaVersion: 17" + eol +
            "Content-Type: application/json" + eol +
            `RequestType: ${type}` + eol +
            "ResponseCount: single" + eol +
            "BodyId: " + eol +
            "X-ApplicationName: Quicksilver" + eol + 
            "X-ApplicationVersion: 1.2" + eol +
            "X-ApplicationSessionId: 0x" + this.sessionID + eol + eol;

        const body = JSON.stringify(content) + "\n"

        return "MRPC/2 " + header.length + " " + body.length + eol + header + body
    }
}
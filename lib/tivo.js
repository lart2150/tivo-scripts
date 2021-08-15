'use strict'
import tls from 'tls';
import fs from 'fs';
import {URL} from 'url';

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
        this.disconnect();
        
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
            try {
                this.socket = tls.connect(options, () => {
                    this.socket.setEncoding('utf8');
                    this.socket.write(this.buildRequest({"type":"bodyAuthenticate","credential":{"type":"makCredential","key":this.mak}}));
                    
                    this.data = "";

                    this.socket.on('data', this.read.bind(this));
                });
                this.socket.on('error', (err) => {
                    //console.error('TIVO TLS error', err);
                    this.socket.end();
                    reject(err);
                });
                
            } catch (e) {
                //console.error('TIVO connection error', e)
                reject(e);
            }
        });

        const response = await promise;
        this.received = null;

        const bodyResponse = await this.sendRequest({type: "bodyConfigSearch", "bodyId": "-"});
        this.bodyId = bodyResponse.bodyConfig[0].bodyId;
    }

    async sendRequestAllPages(content, responseKey, count = 50) {
        content.count = 50;
        let response = await this.sendRequest(content);
        let combinedResponse = response;
        let offset = count;
        while (response.isBottom === false) {
            content.offset = offset;
            console.log(offset);
            offset += count;
            response = await this.sendRequest(content);
            combinedResponse[responseKey] = combinedResponse[responseKey].concat(response[responseKey]);
        }
        return combinedResponse;
    }

    async sendRequest(content) {
        if (this.received) {
            throw new Error('Don\'t send concucrent requests');
        }

        this.bodyLength = -1;
        this.body = "";
        this.data = "";

        const request = this.buildRequest(content);
        const promise = new Promise((resolve, reject) => {
            this.received = resolve;
            if (!this.isConnected()) {
                this.connect().then(() => this.socket.write(request) )
            } else {
                this.socket.write(request);
            }
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

    isConnected() {
        return this.socket && this.socket.writable;
    }
    disconnect() {
        if (this.socket && this.socket.writable) {
            this.socket.end();
            if (this.received) {
                this.received('{}')
                this.received = null;
            }
        } 
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

        if (this.received && this.body && Buffer.byteLength(this.body, 'utf8') >= this.bodyLength) {
            this.received(this.body);
        }
    }


    /**
     * 
     * @param {object} content 
     * @returns {string}
     */
    buildRequest(content) {
        if (!content.bodyId && this.bodyId) {
            content.bodyId = this.bodyId;
        }
        const eol = "\r\n";
        const header = "Type: request" + eol +
            `RpcId: ${this.rpcId++}` + eol +
            "SchemaVersion: 17" + eol +
            "Content-Type: application/json" + eol +
            `RequestType: ${content.type}` + eol +
            "ResponseCount: single" + eol +
            "BodyId: " + eol +
            "X-ApplicationName: Quicksilver" + eol + 
            "X-ApplicationVersion: 1.2" + eol +
            "X-ApplicationSessionId: 0x" + this.sessionID + eol + eol;

        const body = JSON.stringify(content) + "\n"

        return "MRPC/2 " + header.length + " " + body.length + eol + header + body
    }

    /**
     * send a key event to the tivo
     * @param {string} key 
     * @param {object} options 
     */
    sendKey(key, options = {}) {
        return this.sendRequest(
            {
                type: 'keyEventSend',
                event: key,
                ...options
            }
        );
    }

    configSearch(options = {}) {
        return this.sendRequest(
            {
                type: 'bodyConfigSearch',
                ...options
            }
        );
    }

    tunerState(options = {}) {
        return this.sendRequest(
            {
                type: 'tunerStateEventRegister',
                ...options
            }
        );
    }

    whatsOn(options = {}) {
        return this.sendRequest(
            {
                type: 'whatsOnSearch',
                ...options
            }
        );
    }

    phoneHome(options = {}) {
        return this.sendRequest(
            {
                type: 'phoneHomeRequest',
                ...options
            }
        );
    }

    phoneHomeStatus(options = {}) {
        return this.sendRequest(
            {
                type: 'phoneHomeStatusEventRegister',
                ...options
            }
        );
    }
    
    systemInformation(options = {}) {
        return this.sendRequest(
            {
                type: 'systemInformationGet',
                ...options
            }
        );
    }

    uiNavigate(uri, options = {}) {
        return this.sendRequest(
            {
                type: 'uiNavigate',
                uri,
                ...options
            }
        );
    }

    getRecordingInfo(recordingId) {
        return this.sendRequest({
            type: 'recordingSearch',
            recordingId,
        })
    }

    async getAllRecordings() {
        let response = await this.sendRequest({
            type: 'recordingFolderItemSearch',
            //count: 50
        });
    
        let allRecordings = [];
    
        for (const folderItem of response.recordingFolderItem) {
            if (folderItem.collectionType === 'series' && folderItem.folderType !== 'suggestion') {
                const collectionRecordings =  await this.sendRequestAllPages({
                    type: 'recordingSearch',
                    collectionId: folderItem.collectionId,
                    state: ['inProgress', 'complete'],
                    count: 50,
                }, 'recording');
                allRecordings.push(...collectionRecordings.recording);
            } else if (folderItem.folderType !== 'suggestion') {
                const recording =  await this.getRecordingInfo(folderItem.childRecordingId);
                allRecordings.push(...recording.recording);
            } else if (folderItem.recordingFolderItemId) {
                let folderItems  = await this.sendRequest({
                    type: 'recordingFolderItemSearch',
                    parentRecordingFolderItemId: folderItem.recordingFolderItemId
                });
                for (const folderItem of folderItems.recordingFolderItem) {
                    const recording =  await this.getRecordingInfo(folderItem.childRecordingId);
                    folderItem.recordings = recording.recording;
                    allRecordings.push(...recording.recording);
                }
            }
    
        }
        return allRecordings;
    }

    async getDownloadUrlForRecording(recordingId, useTs = true) {
        const recordingMeta = await this.sendRequest({
            type: 'idSearch',
            objectId: recordingId, 
            namespace: 'mfs',
        });
        console.log(recordingMeta);
    
        const downloadId = recordingMeta.objectId[0].replace('mfs:rc.', '');
        const dUrl = new URL('http://localhost/download/download.TiVo?Container=%2FNowPlaying');
        dUrl.password = this.mak
        dUrl.username = 'tivo';
        
        dUrl.host = this.ip;
        dUrl.searchParams.append('id', downloadId);
        useTs && dUrl.searchParams.append('Format','video/x-tivo-mpeg-ts');
        return dUrl.toString();

         `http://${this.ip}/download/download.TiVo?Container=%2FNowPlaying&id=` + encodeURIComponent(downloadId) + (useTs ? '&Format=video/x-tivo-mpeg-ts' : '');
    }

    async reboot() {
        let response = await this.uiNavigate('x-tivo:classicui:restartDvr');
    
        await new Promise(resolve => setTimeout(resolve, 5000));
    
        response = await this.sendKey('thumbsDown');
        response = await this.sendKey('thumbsDown');
        response = await this.sendKey('thumbsDown');
    
        response = await this.sendKey('enter');
    }
}
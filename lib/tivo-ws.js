'use strict'
import WebSocket from 'ws';
import {URL} from 'url';
import fs from 'fs';

export class TivoWs {
    /**
     * 
     * @param {string} domainToken domainToken
     * @param {string} tsn tsn
     */
    constructor(domainToken, tsn) {
        this.rpcId = 0;
        this.received = [];
        this.domainToken = domainToken;
        this.bodyId = tsn;
    }

    async connect () {
        this.disconnect();
        this.received = [];
        
        this.ws = new WebSocket(
            'wss://middlemind.tivo.com:2196',
            'com.tivo.mindrpc.2',
            {
                protocol: 'com.tivo.mindrpc.2',
                rejectUnauthorized: false,
                ca: fs.readFileSync('mind-inter.cer'),
            }
        );

        this.ws.on('error', (e) => {
            console.log('Tivo mind websocket error', e);
        });
        
        this.ws.on('close', (e, b) => {
            console.log('Tivo mind websocket closed', e, b.toString('utf8'));
        });

        let rpcId = this.rpcId;
        const promise = new Promise((resolve, reject) => {
            
            try {
                this.ws.on('open', () => {
                    let rpcId = this.rpcId;
                    const bodyAuthenticate = this.buildRequest({
                        credential:{
                            domainToken:{
                                domain:"tivo",
                                token:this.domainToken,
                                type:"domainToken"
                            },
                            type:"domainTokenCredential"
                        },
                        responseTemplate:[
                            {type:"responseTemplate"}
                        ],
                        type:"bodyAuthenticate"
                    });
                    this.ws.send(bodyAuthenticate);
                    
                    this.received[rpcId] = {resolve, waitForFinal: false};

                    this.ws.on('message', this.read.bind(this));
                });
                
            } catch (e) {
                //console.error('TIVO connection error', e)
                reject(e);
            }
        });

        const response = await promise;
        this.received[rpcId] = null;

        // const bodyResponse = await this.sendRequest({type: "bodyConfigSearch", "bodyId": "-"});
        // this.bodyId = bodyResponse.bodyConfig[0].bodyId;
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

    async sendRequest(content, waitForFinal = false) {
        const rpcId = this.rpcId;
        const request = this.buildRequest(content);
        
        const promise = new Promise((resolve, reject) => {
            this.received[rpcId] = {resolve, waitForFinal};
            if (!this.isConnected()) {
                this.connect().then(() => this.ws.send(request) )
            } else {
                this.ws.send(request);
            }
        });

        const response = await promise;
        this.received[rpcId] = undefined;
        //console.log(response);
        const responseBody = JSON.parse(response);

        if (responseBody.type === 'error') {
            throw new Error(response);
        }

        return responseBody;
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        } 
    }

    /**
     * used for callbaks don't use
     * @param {string} chunk 
     */
    read(chunk) {
        //console.log('chunk', chunk.toString('utf8'))
        const [headersString, body] = chunk.toString('utf8').split("\r\n\r\n");
        const headers = headersString.split("\r\n");
        const rpcIdHeader = headers.find((h) => h.toLocaleLowerCase().indexOf('rpcid:') === 0);
        const rpcId = parseInt(rpcIdHeader.split(' ')[1], 10);
        
        if (this.received[rpcId]) {
            const isFinalHeader = headers.find((h) => h.toLocaleLowerCase().indexOf('isfinal:') === 0);
            const isFinal = JSON.parse(isFinalHeader.split(' ')[1]);
            if (this.received[rpcId].waitForFinal && isFinal) {
                this.received[rpcId].resolve(body);
            } else if (!this.received[rpcId].waitForFinal) {
                this.received[rpcId].resolve(body);
            }
        } else {
            console.error('received rpc response but don\'t have a prmise: ' + rpcId);
        }
    }


    /**
     * 
     * @param {object} content 
     * @returns {string}
     */
    buildRequest(content) {
        const eol = "\r\n";

        let SchemaVersion = 21;
        if (content.SchemaVersion) {
            SchemaVersion = content.SchemaVersion;
            content.SchemaVersion = undefined;
        }

        if (!content.bodyId && this.bodyId) {
            content.bodyId = this.bodyId;
        }        

        let bodyIdHeader = '';
        if (this.bodyId && content.type !== "bodyAuthenticate") {
            bodyIdHeader = `BodyId: ${this.bodyId}${eol}`;
        }

        let responseCount = 'single';
        if (content.responseCount) {
            responseCount = content.responseCount;
            content.responseCount = undefined;
        }

        const header = "Type: request" + eol +
            `RpcId: ${this.rpcId++}` + eol +
            "SchemaVersion: " + SchemaVersion + eol +
            "Content-Type: application/json" + eol +
            `RequestType: ${content.type}` + eol +
            bodyIdHeader +
            `ResponseCount: ${responseCount}` + eol + eol;

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

    cipMetaDataSearch(clipMetadataId, recordingId, options = {}){
        return this.sendRequest(
            {
                type: 'clipMetadataAdjust',
                clipMetadataId,
                recordingId,
                ...options
            }
        );
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
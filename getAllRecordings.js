'use strict'
import {Tivo} from './lib/tivo.js';
import {config} from './config.js';

const doit = async () => {
    const tivo = new Tivo(config.ip, config.mak);
    await tivo.connect();
    console.log('connected');
    
    const allRecordings = await tivo.getAllRecordings();
    //console.log(allRecordings[0]);

    allRecordings.forEach((r) => {
        console.log(`${r.title} - ${r.subTitle} ${r.startTime} : ${r.recordingId}`);
    })
    
    tivo.disconnect();
}

doit();
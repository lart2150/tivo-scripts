'use strict'
import {Tivo} from './lib/tivo.js';
import {config} from './config.js';
import {URL} from 'url';
import { pipeline } from 'stream';
import { spawn } from 'child_process';
import DigestFetch from "digest-fetch";


const doit = async (recordingId) => {
    const tivo = new Tivo(config.ip, config.mak);
    await tivo.connect();
    console.log('connected');

    let recording = null;
    try {
        recording = (await tivo.getRecordingInfo(recordingId)).recording;
    } catch (e) {
        console.error('Error finding recording', e);
        tivo.disconnect();
        return;
    }

    const recordingInfo = recording[0];

    let filename = recordingInfo.title;

    if (recordingInfo.collectionType === 'series') {
        if (recordingInfo.episodeNum && recordingInfo.seasonNumber) {
            const episode =String(recordingInfo.episodeNum[0]).padStart(2, '0');
            filename += ` - ${recordingInfo.seasonNumber}x${episode}`;
        }
        if (recordingInfo.subtitle) {
            filename += ` - ${recordingInfo.subtitle}`;
        }
    } else {
        if (recordingInfo.movieYear) {
            filename += ` (${recordingInfo.movieYear})`;
        }
    }
    filename += '.ts';

    const downloadUrl = await tivo.getDownloadUrlForRecording(recordingId);
    console.log(downloadUrl);
    tivo.disconnect();

    const urlO = new URL(downloadUrl)


    //const file = fs.createWriteStream("rc.16045009.tivo");
    const tivoDecode = spawn(
        config.tivoDecodePath,
        [
            '--mak',
            config.mak,
            '--no-verify',
            '--out',
            filename,
            '-',
        ]
    )
    const client = new DigestFetch(urlO.username, urlO.password);
    const resp = await client.fetch(downloadUrl, {
        headers: {//so hear me out... it requires a session cookie but the value does not seem to matter too much
            cookie: 'sid=0000000000000000',
        },
    })

    pipeline(resp.body, tivoDecode.stdin, (err, value) => {
        if (err) {
            console.error(err);
          } else {
            console.log('Finished downloading');
          }
    });
    console.log("Starting Download: " + filename);

}

if (process.argv.length < 3) {
    console.error ('this requires a recording ID to download');
} else {
    doit(process.argv[2]);
}

import {Tivo} from './lib/tivo.js'
import {config} from './config.js';

/**
 * 
 * @param {{title: string, collectionId: string}} recording 
 * @returns shouldDelete
 */
const shouldDelete = (recording) => {
    if (
        (config.deleteTitles && config.deleteTitles.includes(recording.title)) ||
        (config.deleteRegex && config.deleteRegex.test(recording.title))
    ) {
        return true;
    }
    return false;
}

const doit = async () => {
    const tivo = new Tivo(config.ip, config.mak);
    await tivo.connect();
    console.log('connected');
    
    let recordings = [];
    if (config.deleteScanAll || config.deleteDuplicats) {
        const body = await tivo.sendRequestAllPages(
            {type:'recordingSearch', "state":["deleted"]},
            'recording'
        );
        recordings = body.recording;
    } else {
        const body = await tivo.sendRequest(
            {
                type: 'recordingSearch',
                state: ['deleted'],
                count: 50
            }
        );
        recordings = body.recording;
    }
    
    
    for (let i = 0; i < recordings.length; i++) {
        const r = recordings[i];
        //console.log(r.title, r.subtitle, r.collectionId);
        if (shouldDelete(r)) {
            console.log(r.title, r.subtitle, r.collectionId);
            console.log('DELETE');
            const deleted = await tivo.sendRequest({type: 'recordingUpdate', state:"contentDeleted", recordingId:[r.recordingId]});
            // const deleted = {};
            if (deleted.type === 'success') {
                console.log('done did deleted that thing');
            } else {
                console.log('error deleting show?', deleted);
            }
        }
    }

    if (config.deleteDuplicats && recordings.length) {
        const shows = new Map();
        recordings.forEach(r => {
            if (!r.seasonNumber || !r.episodeNum || !r.subtitle) {
                return;
            }
            if (!shows.get(r.title)) {
                const show = [r]
                shows.set(r.title, show);
                return;
            }
            shows.get(r.title).push(r);
        });
        //console.log(shows);

        for (const [title, showRecordings] of shows.entries()) {

            //console.log(title)
            for (const r of showRecordings) {
                const dupes = showRecordings.filter(
                    b => r.seasonNumber === b.seasonNumber 
                    && r.episodeNum[0] === b.episodeNum[0]
                    && r.subtitle === b.subtitle
                );

                if (dupes.length > 1 ){
                    dupes.sort((a, b) => {
                        //pick hd over sd
                        if (a.hdtv !== b.hdtv) {
                            return !a.hdtv
                        }

                        //one has skip mode the other does not pick the one with
                        //this might need to be updated to look for "segmentType": "adSkip"
                        if (b.clipMetadata === undefined && a.clipMetadata) {
                            return -1
                        }
                        if (a.clipMetadata === undefined && b.clipMetadata) {
                            return 1
                        }

                        return Math.sign(b.duration - a.duration);
                    })

                    //keep the first recording
                    for (let i = 1; i < dupes.length; i++) {
                        const r = dupes[i];
                        console.log(`Deleting Dupe: ${r.title} S${r.seasonNumber}E${r.episodeNum[0]} - ${r.subtitle} ${r.startTime}`);
                        const deleted = await tivo.sendRequest({type:'recordingUpdate', state:"contentDeleted", recordingId:[r.recordingId]});
                        //const deleted = {type:'success'};
                        if (deleted.type === 'success') {
                            console.log('done did deleted that thing');
                            const index = showRecordings.findIndex(rec => rec.recordingId === r.recordingId);
                            showRecordings.splice(index, 1);
                        } else {
                            console.log('error deleting show?', deleted);
                        }
                    }
                }
            }
        }
    }
    
    tivo.disconnect();
}

doit();
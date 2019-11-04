const _ = require('lodash');
const Busboy = require('busboy');
const GridFS = require('gridfs-stream');
const ZipStream = require('zip-stream');

const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const path = require('path');
const os = require('os');
const fs = require('fs-extra');

module.exports = GridFSService;

function GridFSService(options) {
  if (!(this instanceof GridFSService)) {
    return new GridFSService(options);
  }

  this.options = options;
  // fax files are temporarily saved here till upload
  this._saveDir = path.join(os.homedir() + '/fax_downs');
  // check if directory for temporary storage of fax exists or not
  // create otherwise
  if (!fs.existsSync(this._saveDir)) {
    fs.mkdirsSync(this._saveDir, function (err) {
      if (err) console.error(err);
      else console.log('Dir Created');
    });
  }
}

/**
 * Connect to mongodb if necessary.
 */
GridFSService.prototype.connect = function (cb) {
  var self = this;

  if (!this.db) {
    var url;
    if (!self.options.url) {
      url = (self.options.username && self.options.password) ?
        'mongodb://{$username}:{$password}@{$host}:{$port}/{$database}' :
        'mongodb://{$host}:{$port}/{$database}';

      // replace variables

      url = url.replace(/\{\$([a-zA-Z0-9]+)\}/g, (pattern, option) => {
        return self.options[option] || pattern;
      });
    } else {
      url = self.options.url;
    }

    // connect

    MongoClient.connect(url, self.options, (error, client) => {
      if (!error) {
        self.db = client.db(self.options.database);
      }

      return cb(error, self.db);
    });
  }
};

/**
 * List all storage containers
 */

GridFSService.prototype.getContainers = function (cb) {
  var collection = this.db.collection('fs.files');

  collection.find({ 'metadata.container': { $exists: true } }).toArray(function (error, files) {
    var containerList = [];

    if (!error) {
      containerList = _(files)
        .map('metadata.container').uniq().value();
    }

    return cb(error, containerList);
  });
};

/**
 * Elimina todos los ficheros que cumplen con la condición
 */

GridFSService.prototype.delete = function (where, cb) {
  const fs_files = this.db.collection('fs.files');
  const fs_chunks = this.db.collection('fs.chunks');

  fs_files.find(where, { _id: 1 }).toArray((error, containerFiles) => {
    if (!containerFiles || containerFiles.length <= 0) {
      return cb(error);
    }

    const files = containerFiles.map(file => file._id);

    fs_chunks.deleteMany({ 'files_id': { $in: files } }, (error) => {
      if (error) {
        return cb(error);
      }

      fs_files.deleteMany({ '_id': { $in: files } }, (error) => {
        return cb(error);
      });
    });
  });
};

/**
 * Delete an existing storage container.
 */
GridFSService.prototype.deleteContainer = function (containerName, cb) {
  var fs_files = this.db.collection('fs.files');
  var fs_chunks = this.db.collection('fs.chunks');

  fs_files.find({ 'metadata.container': containerName }, { _id: 1 }).toArray(function (error, containerFiles) {
    if (!containerFiles || containerFiles.length <= 0) {
      return cb(error);
    }

    var files = [];

    for (var index in containerFiles) {
      files.push(containerFiles[index]._id);
    }

    fs_chunks.deleteMany({
      'files_id': { $in: files }
    }, function (error) {
      if (error) {
        return cb(error);
      }

      fs_files.deleteMany({
        'metadata.container': containerName
      }, function (error) {
        return cb(error);
      });
    });
  });
};

/**
 * Delete files an existing storage container
 * @param {{string}} container Container
 * @param {{string}} type Type of file: attachment or image
 */

GridFSService.prototype.deleteFilesContainerByType = function (container, type, cb) {
  var fs_files = this.db.collection('fs.files');
  var fs_chunks = this.db.collection('fs.chunks');

  fs_files.find({ 'metadata.container': container, 'metadata.type': type }, { _id: 1 }).toArray(function (error, containerFiles) {
    if (!containerFiles || containerFiles.length <= 0) {
      return cb(error);
    }

    var files = [];

    for (var index in containerFiles) {
      files.push(containerFiles[index]._id);
    }

    fs_chunks.deleteMany({
      'files_id': { $in: files }
    }, function (error) {
      if (error) {
        return cb(error);
      }

      fs_files.deleteMany({
        'metadata.container': container
      }, function (error) {
        return cb(error);
      });
    });
  });
};

/**
 * List all files within the given container.
 */
GridFSService.prototype.getFiles = function (containerName, cb) {
  var collection = this.db.collection('fs.files');

  collection.find({
    'metadata.container': containerName
  }).toArray(function (error, container) {
    return cb(error, container);
  });
};

/**
 * List all files within the given container.
 */
GridFSService.prototype.getFilesByType = function (container, type, cb) {
  const collection = this.db.collection('fs.files');

  collection.find({
    'metadata.container': container,
    'metadata.type': type
  }, { sort: 'filename' }).toArray(function (error, file) {
    return cb(error, file);
  });
};

/**
 * List all the files that meet the conditions
 */

GridFSService.prototype.findFiles = function (where, cb) {
  const collection = this.db.collection('fs.files');

  collection.find(where, { sort: 'filename' }).toArray(function (error, files) {
    return cb(error, files);
  });
};

/**
 * Return a file with the given id within the given container.
 */
GridFSService.prototype.getFile = function (containerName, fileId, cb) {
  var collection = this.db.collection('fs.files');

  collection.find({
    '_id': new mongodb.ObjectID(fileId),
    'metadata.container': containerName
  }).limit(1).next(function (error, file) {
    if (!file) {
      error = new Error('Fichero no encontrado.');
      error.status = 404;
    }
    return cb(error, file || {});
  });
};

/**
 * Return a file with the given filename within the given container.
 */
GridFSService.prototype.getFileByName = function (containerName, filename, cb) {
  var collection = this.db.collection('fs.files');

  collection.find({
    'metadata.filename': filename,
    'metadata.container': containerName
  }).limit(1).next(function (error, file) {
    if (!file) {
      error = new Error('Fichero no encontrado');
      error.status = 404;
    }
    return cb(error, file || {});
  });
};

/**
 * Return a file with the given metadata perameter within the given container.
 */
GridFSService.prototype.getFileByMetadataParam = function (containerName, query, cb) {
  var collection = this.db.collection('fs.files');
  collection.find(query).limit(1).next(function (error, file) {
    if (error) {
      error = new Error('Fichero no encontrado');
      error.status = 404;
    }
    return cb(error, file);
  });
};

/**
 * Delete an existing file with the given id within the given container.
 */
GridFSService.prototype.deleteFile = function (containerName, fileId, cb) {
  var fs_files = this.db.collection('fs.files');
  var fs_chunks = this.db.collection('fs.chunks');

  fs_files.deleteOne({
    '_id': new mongodb.ObjectID(fileId),
    'metadata.container': containerName
  }, function (error) {
    if (error) {
      return cb(error);
    }

    fs_chunks.deleteOne({
      'files_id': new mongodb.ObjectID(fileId)
    }, function (error) {
      cb(error);
    });
  });
};

/**
 * Delete an existing file with the given id file.
 */

GridFSService.prototype.deleteFileByFileId = function (fileId, cb) {
  var fs_files = this.db.collection('fs.files');
  var fs_chunks = this.db.collection('fs.chunks');

  fs_files.deleteOne({
    '_id': new mongodb.ObjectID(fileId)
  }, function (error) {
    if (error) {
      return cb(error);
    }

    fs_chunks.deleteOne({
      'files_id': new mongodb.ObjectID(fileId)
    }, function (error) {
      cb(error);
    });
  });
};

/**
 * Delete an existing file with the given name within the given container.
 */
GridFSService.prototype.deleteFileByName = function (containerName, filename, cb) {
  var fs_files = this.db.collection('fs.files');
  var fs_chunks = this.db.collection('fs.chunks');

  fs_files.find({ 'metadata.container': containerName, 'metadata.filename': filename }, { _id: 1 }).toArray(function (error, containerFiles) {
    if (!containerFiles || containerFiles.length <= 0) {
      return cb(error);
    }

    var files = [];

    for (var index in containerFiles) {
      files.push(containerFiles[index]._id);
    }

    fs_chunks.deleteMany({
      'files_id': { $in: files }
    }, function (error) {
      if (error) {
        return cb(error);
      }

      fs_files.deleteMany({
        'metadata.filename': filename,
        'metadata.container': containerName
      }, function (error) {
        return cb(error);
      });
    });
  });
};

/**
 * Upload middleware for the HTTP request.
 */
GridFSService.prototype.upload = function (containerName, req, cb) {
  var self = this;

  var busboy = new Busboy({
    headers: req.headers
  });

  busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
    var options = {
      _id: new mongodb.ObjectID(),
      filename: filename,
      metadata: {
        container: containerName,
        filename: filename,
        mimetype: mimetype
      },
      mode: 'w'
    };

    var gridfs = new GridFS(self.db, mongodb);
    var stream = gridfs.createWriteStream(options);

    stream.on('close', function (file) {
      return cb(null, file);
    });

    stream.on('error', cb);

    file.pipe(stream);
  });

  req.pipe(busboy);
};

/**
 * UploadWithJson middleware for the HTTP request.
 */
GridFSService.prototype.uploadWithJson = function (containerName, filter, cb) {
  var self = this;
  console.log('.................../////', containerName);
  
  var objs = filter;
  var filePaths = '';
  var faxFileName = objs.DocumentParams.Hash;
  if (objs.DocumentParams.Type === 'image/tiff') {
    faxFileName += '.tiff';
  } else if (objs.DocumentParams.Type === 'application/pdf') {
    faxFileName += '.pdf';
  } else {
    throw new Error('unhandled mimetype');
  }

  // parsing binary data from base64 FaxImage response
  var base64Data = objs.FaxImage;
  var binaryData = new Buffer.from(base64Data, 'base64').toString('binary');
  // declare path to faxFile  in local storage
  var pathFaxFile = path.join(this._saveDir, faxFileName);
  filePaths = pathFaxFile;

  // saving fax image to user's directory for storing through mongoDb
  fs.writeFileSync(pathFaxFile, binaryData, 'binary');
  console.log(faxFileName + ' saved to ' + this._saveDir + '!');
  // remove faxImage element from the object
  delete objs.FaxImage;
  objs.container = containerName;
  var gridfs = new GridFS(self.db, mongodb);
  var streamwriter = gridfs.createWriteStream({
    _id: new mongodb.ObjectID(),
    filename: path.basename(filePaths),
    mode: 'w',
    content_type: objs.DocumentParams.Type,
    metadata: objs
  });
  fs.createReadStream(filePaths).pipe(streamwriter);
  streamwriter.on('close', function (file) {
    console.log(filePaths + ' uploaded to mongoDB successfully');
    fs.removeSync(filePaths);
    console.log('local file ' + filePaths + ' removed!')
    return cb(null, file);
  });

  // var busboy = new Busboy({
  //   headers: req.headers
  // });

  // busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
  //   var options = {
  //     _id: new mongodb.ObjectID(),
  //     filename: filename,
  //     metadata: {
  //       container: containerName,
  //       filename: filename,
  //       mimetype: mimetype
  //     },
  //     mode: 'w'
  //   };

  //   var gridfs = new GridFS(self.db, mongodb);
  //   var stream = gridfs.createWriteStream(options);

  //   stream.on('close', function (file) {
  //     return cb(null, file);
  //   });

  //   stream.on('error', cb);

  //   file.pipe(stream);
  // });

  // req.pipe(busboy);
};

/**
 * Upload middleware for the HTTP request.
 */
GridFSService.prototype.uploadWithMetadata = function (containerName, metadata, req, cb) {
  var self = this;

  var busboy = new Busboy({
    headers: req.headers
  });

  busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
    // Añadir a los metadatos incluidos por el usuario el nombre del contenedor,
    // nombre del fichero y el mime type del fichero

    metadata = metadata || {};

    metadata.container = containerName;
    metadata.filename = filename;
    metadata.mimetype = mimetype;

    var options = {
      _id: new mongodb.ObjectID(),
      filename: filename,
      metadata: metadata,
      mode: 'w'
    };

    var gridfs = new GridFS(self.db, mongodb);
    var stream = gridfs.createWriteStream(options);

    stream.on('close', function (file) {
      return cb(null, file);
    });

    stream.on('error', cb);

    file.pipe(stream);
  });

  req.pipe(busboy);
};

/**
 * Download middleware for the HTTP request.
 */

GridFSService.prototype.download = function (fileId, res, cb) {
  var self = this;

  var collection = this.db.collection('fs.files');

  collection.find({
    '_id': new mongodb.ObjectID(fileId)
  }).limit(1).next(function (error, file) {
    if (!file) {
      error = new Error('Fichero no encontrado.');
      error.status = 404;
    }

    if (error) {
      return cb(error);
    }

    var gridfs = new GridFS(self.db, mongodb);
    var stream = gridfs.createReadStream({
      _id: file._id
    });

    // set headers
    res.set('Content-Type', file.metadata.mimetype);
    res.set('Content-Length', file.length);
    res.set('Content-Disposition', `attachment;filename=${file.filename}`);

    return stream.pipe(res);
  });
};

GridFSService.prototype.downloadContainer = function (containerName, req, res, cb) {
  var self = this;

  var collection = this.db.collection('fs.files');

  collection.find({
    'metadata.container': containerName
  }).toArray(function (error, files) {
    if (files.length === 0) {
      error = new Error('Archivo sin ficheros.');
      error.status = 404;
    }

    if (error) {
      return cb(error);
    }

    var gridfs = new GridFS(self.db, mongodb);
    var archive = new ZipStream();

    function next() {
      if (files.length > 0) {
        var file = files.pop();
        var fileStream = gridfs.createReadStream({ _id: file._id });

        archive.entry(fileStream, { name: file.filename }, next);
      } else {
        archive.finish();
      }
    }

    next();

    var filename = req.query.filename || 'file';

    res.set('Content-Disposition', `attachment;filename=${filename}.zip`);
    res.set('Content-Type', 'application/zip');

    return archive.pipe(res);
  });
};

/**
 * Método que descarga un listado de ficheros comprimidos en formato zip
 * @param {{string}} filesId Cadena con los identificadores de los ficheros
 * a descargar comprimidos separados por comas
 */

GridFSService.prototype.downloadZipFiles = function (filesId, res, cb) {
  if (!filesId) {
    return cb(new Error('Ficheros no especificados.'));
  }

  const ObjectId = require('mongodb').ObjectID;
  const Ids = filesId.split(',').map(id => ObjectId(id));

  var self = this;

  var collection = this.db.collection('fs.files');

  collection.find({ '_id': { $in: Ids } }).toArray(function (error, files) {
    if (files.length === 0) {
      error = new Error('No se han encontrado los ficheros a descargar.');
      error.status = 404;
    }

    if (error) {
      return cb(error);
    }

    var gridfs = new GridFS(self.db, mongodb);
    var archive = new ZipStream();

    function next() {
      if (files.length > 0) {
        var file = files.pop();
        var fileStream = gridfs.createReadStream({ _id: file._id });

        archive.entry(fileStream, { name: file.filename }, next);
      } else {
        archive.finish();
      }
    }

    next();

    const fecha = new Date();
    const filename = `documentos-${fecha.getFullYear()}${fecha.getMonth() + 1}${fecha.getDate()}`;

    res.set('Content-Disposition', `attachment;filename=${filename}.zip`);
    res.set('Content-Type', 'application/zip');

    return archive.pipe(res);
  });
};

/**
 * Download middleware for the HTTP request.
 */
GridFSService.prototype.downloadInline = function (fileId, res, cb) {
  var self = this;

  var collection = this.db.collection('fs.files');

  collection.find({
    '_id': new mongodb.ObjectID(fileId)
  }).limit(1).next(function (error, file) {
    if (!file) {
      error = new Error('Fichero no encontrado.');
      error.status = 404;
    }

    if (error) {
      return cb(error);
    }

    var gridfs = new GridFS(self.db, mongodb);
    var stream = gridfs.createReadStream({
      _id: file._id
    });

    // set headers
    res.set('Content-Type', file.metadata.mimetype);
    res.set('Content-Length', file.length);
    res.set('Content-Disposition', `inline;filename=${file.filename}`);

    return stream.pipe(res);
  });
};

/**
 * Get stream fileId.
 */

GridFSService.prototype.getStreamFileId = function (fileId, cb) {
  var self = this;

  var collection = this.db.collection('fs.files');

  collection.find({
    '_id': new mongodb.ObjectID(fileId)
  }).limit(1).next(function (error, file) {
    if (!file) {
      error = new Error('Fichero no encontrado.');
      error.status = 404;
    }

    if (error) {
      return cb(error);
    }

    var gridfs = new GridFS(self.db, mongodb);

    return cb(null, gridfs.createReadStream({ _id: file._id }));
  });
};

/**
 * Download middleware for the HTTP request.
 */
GridFSService.prototype.downloadInlineByName = function (containerName, filename, res, cb) {
  var self = this;

  var collection = this.db.collection('fs.files');

  collection.find({
    'metadata.filename': filename,
    'metadata.container': containerName
  }).limit(1).next(function (error, file) {
    if (!file) {
      error = new Error(`Fichero "${filename}" no encontrado.`);
      error.status = 404;
    }

    if (error) {
      return cb(error);
    }

    var gridfs = new GridFS(self.db, mongodb);
    var stream = gridfs.createReadStream({
      _id: file._id
    });

    // set headers
    res.set('Content-Type', file.metadata.mimetype);
    res.set('Content-Length', file.length);
    res.set('Content-Disposition', `inline;filename=${file.filename}`);

    return stream.pipe(res);
  });
};

GridFSService.modelName = 'storage';

/*
 * Routing options
 */

/*
 * GET /FileContainers
 */
GridFSService.prototype.getContainers.shared = true;
GridFSService.prototype.getContainers.accepts = [];
GridFSService.prototype.getContainers.returns = {
  arg: 'containers',
  type: 'array',
  root: true
};
GridFSService.prototype.getContainers.http = {
  verb: 'get',
  path: '/'
};

/*
 * DELETE /FileContainers/deleteFileByWhere/:where
 */
GridFSService.prototype.delete.shared = true;
GridFSService.prototype.delete.accepts = [
  { arg: 'where', type: 'string', description: 'Where sentence' }
];
GridFSService.prototype.deleteContainer.returns = {};
GridFSService.prototype.deleteContainer.http = {
  verb: 'delete',
  path: '/deleteFileByWhere/:where'
};

/*
 * DELETE /FileContainers/:containerName
 */
GridFSService.prototype.deleteContainer.shared = true;
GridFSService.prototype.deleteContainer.accepts = [
  { arg: 'containerName', type: 'string', description: 'Container name' }
];
GridFSService.prototype.deleteContainer.returns = {};
GridFSService.prototype.deleteContainer.http = {
  verb: 'delete',
  path: '/:containerName'
};

/*
 * GET /FileContainers/:containerName/files
 */
GridFSService.prototype.getFiles.shared = true;
GridFSService.prototype.getFiles.accepts = [
  { arg: 'containerName', type: 'string', description: 'Container name' }
];
GridFSService.prototype.getFiles.returns = {
  type: 'array',
  root: true
};
GridFSService.prototype.getFiles.http = {
  verb: 'get',
  path: '/:containerName/files'
};

/*
 * GET /FileContainers/:containerName/files/:fileId
 */
GridFSService.prototype.getFile.shared = true;
GridFSService.prototype.getFile.accepts = [
  { arg: 'containerName', type: 'string', description: 'Container name' },
  { arg: 'fileId', type: 'string', description: 'File id' }
];
GridFSService.prototype.getFile.returns = {
  type: 'object',
  root: true
};
GridFSService.prototype.getFile.http = {
  verb: 'get',
  path: '/:containerName/files/:fileId'
};

/*
 * GET /FileContainers/:containerName/getFileByName/:filename
 */
GridFSService.prototype.getFileByName.shared = true;
GridFSService.prototype.getFileByName.accepts = [
  { arg: 'containerName', type: 'string', description: 'Container name' },
  { arg: 'filename', type: 'string', description: 'File name' }
];
GridFSService.prototype.getFileByName.returns = {
  type: 'object',
  root: true
};
GridFSService.prototype.getFileByName.http = {
  verb: 'get',
  path: '/:containerName/getFileByName/:filename'
};

/*
 * GET /FileContainers/:containerName/getFileByMetadataParam
 */
GridFSService.prototype.getFileByMetadataParam.shared = true;
GridFSService.prototype.getFileByMetadataParam.accepts = [
  { arg: 'containerName', type: 'string', description: 'Container name' },
  { arg: 'filter', type: 'object', http: { source: 'body' } }
];
GridFSService.prototype.getFileByMetadataParam.returns = {
  type: 'object',
  root: true
};
GridFSService.prototype.getFileByMetadataParam.http = {
  verb: 'post',
  path: '/:containerName/getFileByMetadataParam'
};


/*
 * DELETE /FileContainers/:containerName/files/:fileId
 */
GridFSService.prototype.deleteFile.shared = true;
GridFSService.prototype.deleteFile.accepts = [
  { arg: 'containerName', type: 'string', description: 'Container name' },
  { arg: 'fileId', type: 'string', description: 'File id' }
];
GridFSService.prototype.deleteFile.returns = {};
GridFSService.prototype.deleteFile.http = {
  verb: 'delete',
  path: '/:containerName/files/:fileId'
};

/*
 * DELETE /FileContainers/files/:fileId
 */
GridFSService.prototype.deleteFileByFileId.shared = true;
GridFSService.prototype.deleteFileByFileId.accepts = [
  { arg: 'fileId', type: 'string', description: 'File id' }
];
GridFSService.prototype.deleteFileByFileId.returns = {};
GridFSService.prototype.deleteFileByFileId.http = {
  verb: 'delete',
  path: '/files/:fileId'
};

/*
 * DELETE /FileContainers/:containerName/deleteFileByName/:filename
 */
GridFSService.prototype.deleteFileByName.shared = true;
GridFSService.prototype.deleteFileByName.accepts = [
  { arg: 'containerName', type: 'string', description: 'Container name' },
  { arg: 'filename', type: 'string', description: 'File name' }
];
GridFSService.prototype.deleteFileByName.returns = {};
GridFSService.prototype.deleteFileByName.http = {
  verb: 'delete',
  path: '/:containerName/deleteFileByName/:filename'
};

/*
 * POST /FileContainers/:containerName/upload
 */
GridFSService.prototype.upload.shared = true;
GridFSService.prototype.upload.accepts = [
  { arg: 'containerName', type: 'string', description: 'Container name' },
  { arg: 'req', type: 'object', http: { source: 'req' } }
];
GridFSService.prototype.upload.returns = {
  arg: 'file',
  type: 'object',
  root: true
};
GridFSService.prototype.upload.http = {
  verb: 'post',
  path: '/:containerName/upload'
};

/*
 * POST /FileContainers/:containerName/uploadWithJson
 */
GridFSService.prototype.uploadWithJson.shared = true;
GridFSService.prototype.uploadWithJson.accepts = [
  { arg: 'containerName', type: 'string', description: 'Container name' },
  { arg: 'filter', type: 'object', http: { source: 'body' } }
];
GridFSService.prototype.uploadWithJson.returns = {};
GridFSService.prototype.uploadWithJson.http = {
  verb: 'post',
  path: '/:containerName/uploadWithJson'
};

/*
 * GET /FileContainers/download
 */
GridFSService.prototype.download.shared = true;
GridFSService.prototype.download.accepts = [
  { arg: 'fileId', type: 'string', description: 'File id' },
  { arg: 'res', type: 'object', 'http': { source: 'res' } }
];
GridFSService.prototype.download.http = {
  verb: 'get',
  path: '/download'
};

/*
 * GET /FileContainers/:containerName/download/zip
 */
GridFSService.prototype.downloadContainer.shared = true;
GridFSService.prototype.downloadContainer.accepts = [
  { arg: 'containerName', type: 'string', description: 'Container name' },
  { arg: 'req', type: 'object', 'http': { source: 'req' } },
  { arg: 'res', type: 'object', 'http': { source: 'res' } }
];
GridFSService.prototype.downloadContainer.http = {
  verb: 'get',
  path: '/:containerName/zip'
};

/*
 * GET /FileContainers/downloadZipFiles
 */
GridFSService.prototype.downloadZipFiles.shared = true;
GridFSService.prototype.downloadZipFiles.accepts = [
  { arg: 'filesId', type: 'string', description: 'Cadena de Id Files separados por comas' },
  { arg: 'res', type: 'object', 'http': { source: 'res' } }
];
GridFSService.prototype.downloadZipFiles.http = {
  verb: 'get',
  path: '/downloadZipFiles'
};

/*
 * GET /FileContainers/downloadInline/:fileId
 */
GridFSService.prototype.downloadInline.shared = true;
GridFSService.prototype.downloadInline.accepts = [
  { arg: 'fileId', type: 'string', description: 'File id' },
  { arg: 'res', type: 'object', 'http': { source: 'res' } }
];
GridFSService.prototype.downloadInline.http = {
  verb: 'get',
  path: '/downloadInline/:fileId'
};

/*
 * GET /FileContainers/getStreamFileId/:fileId
 */
GridFSService.prototype.getStreamFileId.shared = true;
GridFSService.prototype.getStreamFileId.accepts = [
  { arg: 'fileId', type: 'string', description: 'File id' }
];
GridFSService.prototype.getStreamFileId.http = {
  verb: 'get',
  path: '/getStreamFileId/:fileId'
};
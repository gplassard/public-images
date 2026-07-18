const { BaseProject } = require('@gplassard/projen-extensions');

const project = new BaseProject({
   name: 'public-images',
});
project.synth();
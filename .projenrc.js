const { GithubWorkflow, GitHub } = require('projen/lib/github');
const { BaseProject, WorkflowActionsX, githubAction } = require('@gplassard/projen-extensions');

const project = new BaseProject({
   name: 'public-images',
});
const github = GitHub.of(project);

const job = new GithubWorkflow(github, 'publish-plakar', {
   name: 'Publish Plakar',
});
job.on({
   workflowDispatch: {},
   push: {
      branches: ['main'],
   },
});
job.addJobs({
   'build-and-push': {
      runsOn: 'ubuntu-latest',
      permissions: {
         contents: 'read',
         packages: 'write',
      },
      steps: [
         WorkflowActionsX.checkout({}),
         {
            name: 'Get short SHA',
            id: 'sha',
            run: 'echo "SHORT_SHA=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT',
         },
         {
            name: 'Prepare Plakar build sources',
            id: 'prepare',
            uses: './.github/actions/prepare-plakar-build',
         },
         {
            name: 'Extract major version',
            id: 'major',
            run: 'echo "MAJOR=$(echo ${{ steps.prepare.outputs.plakar_tag }} | sed -E \'s/^(v?[0-9]+).*/\\1/\')" >> "$GITHUB_OUTPUT"',
         },
         {
            name: 'Extract minor version',
            id: 'minor',
            run: 'echo "MINOR=$(echo ${{ steps.prepare.outputs.plakar_tag }} | sed -E \'s/^(v?[0-9]+\\.[0-9]+).*/\\1/\')" >> "$GITHUB_OUTPUT"',
         },
         {
            name: 'Log in to GHCR',
            uses: 'docker/login-action@v3',
            with: {
               registry: 'ghcr.io',
               username: '${{ github.actor }}',
               password: '${{ secrets.GITHUB_TOKEN }}',
            },
         },
         {
            name: 'Build and push Docker image',
            uses: 'docker/build-push-action@v5',
            with: {
               context: '.',
               file: './Dockerfile',
               push: true,
               tags: `ghcr.io/\${{ github.repository }}/plakar:latest,
ghcr.io/\${{ github.repository }}/plakar:\${{ steps.major.outputs.MAJOR }},
ghcr.io/\${{ github.repository }}/plakar:\${{ steps.minor.outputs.MINOR }},
ghcr.io/\${{ github.repository }}/plakar:\${{ steps.prepare.outputs.plakar_tag }},
ghcr.io/\${{ github.repository }}/plakar:\${{ steps.prepare.outputs.plakar_tag }}-\${{ steps.sha.outputs.SHORT_SHA }}`,
               'build-args': `K8S_VERSION=\${{ steps.prepare.outputs.k8s_semver }}\nRCLONE_VERSION=\${{ steps.prepare.outputs.rclone_semver }}`,
            },
         },
      ]
   }
});

const prBuild = new GithubWorkflow(github, 'build', {
   name: 'Build',
});
prBuild.on({
   pullRequest: {},
});
prBuild.addJobs({
   build: {
      runsOn: 'ubuntu-latest',
      permissions: {
         contents: 'read',
      },
      steps: [
         WorkflowActionsX.checkout({}),
         {
            name: 'Prepare Plakar build sources',
            id: 'prepare',
            uses: './.github/actions/prepare-plakar-build',
         },
         {
            name: 'Build Docker image',
            uses: 'docker/build-push-action@v5',
            with: {
               context: '.',
               file: './Dockerfile',
               push: false,
               'build-args': 'K8S_VERSION=${{ steps.prepare.outputs.k8s_semver }}\nRCLONE_VERSION=${{ steps.prepare.outputs.rclone_semver }}',
            },
         },
      ],
   },
});

const updatePlakarIntegrations = new GithubWorkflow(github, 'update-plakar-integrations', {
   name: 'Update Plakar and integrations',
});
updatePlakarIntegrations.on({
   workflowDispatch: {},
   schedule: [{ cron: '0 9 1 * *' }],
});
updatePlakarIntegrations.addJobs({
   update: {
      runsOn: 'ubuntu-latest',
      permissions: {
         contents: 'write',
         'pull-requests': 'write',
      },
      steps: [
         WorkflowActionsX.checkout({}),
         {
            name: 'Find latest stable releases',
            id: 'versions',
            shell: 'bash',
            run: `set -euo pipefail

latest_tag() {
   local repository="$1"
   local prefix="$2"
   git ls-remote --tags --refs "https://github.com/\${repository}.git" "refs/tags/\${prefix}*" \\
      | sed 's#.*refs/tags/##' \\
      | grep -E "^\${prefix}[0-9]+\\.[0-9]+\\.[0-9]+$" \\
      | sort -V \\
      | tail -n 1
}

plakar_tag="$(latest_tag PlakarKorp/plakar v)"
rclone_package_version="$(latest_tag PlakarKorp/integrations rclone/v)"
k8s_version="$(git ls-remote https://github.com/gplassard/plakar-integrations.git HEAD | cut -f1)"
rclone_version="$k8s_version"

for version in "$plakar_tag" "$k8s_version" "$rclone_package_version"; do
   if [[ -z "$version" ]]; then
      echo 'Could not find the latest Plakar release, Kubernetes integration commit, and rclone release.' >&2
      exit 1
   fi
done

printf '%s\\n' "$plakar_tag" > plakar-tag.txt
printf '%s\\n' "$k8s_version" > k8s-version.txt
printf '%s\\n' "$rclone_version" > rclone-version.txt
printf '%s\\n' "$rclone_package_version" > rclone-package-version.txt

echo "plakar_tag=$plakar_tag" >> "$GITHUB_OUTPUT"
echo "k8s_version=$k8s_version" >> "$GITHUB_OUTPUT"
echo "rclone_version=$rclone_version" >> "$GITHUB_OUTPUT"`,
         },
         {
            ...WorkflowActionsX.generateGithubToken({
               permissions: {
                  'permission-contents': 'write',
                  'permission-pull-requests': 'write',
               },
            }),
         },
         {
            name: 'Create or update pull request',
            uses: githubAction('peter-evans/create-pull-request'),
            with: {
               token: '${{ steps.generate_token.outputs.token }}',
               branch: 'github-actions/update-plakar-integrations',
               'delete-branch': true,
               'commit-message': 'chore(deps): update Plakar and integrations',
               title: 'chore(deps): update Plakar and integrations',
               body: `Updates the pinned stable releases of Plakar and its Kubernetes and rclone integrations.

- Plakar: \u0060\${{ steps.versions.outputs.plakar_tag }}\u0060
- Kubernetes integration commit: \u0060\${{ steps.versions.outputs.k8s_version }}\u0060
- rclone integration: \u0060\${{ steps.versions.outputs.rclone_version }}\u0060

The workflow checked the latest Plakar and rclone stable release tags and the latest Kubernetes integration commit before opening this pull request.

[Workflow run](\${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }})`,
            },
         },
      ],
   },
});

project.synth();

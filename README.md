# Setup UTPM GitHub Action

This action installs and configures [UTPM](https://github.com/typst-community/utpm) (Unofficial Typst Package Manager).



## Usage

```yaml
name: CI
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Setup UTPM
      uses: typst-community/setup-utpm@v1
      with:
        version: 'latest'

    - name: Use UTPM
      run: utpm --version
```

## Inputs

| Name      | Description                                                    | Default           | Required |
|-----------|----------------------------------------------------------------|-------------------|----------|
| `version` | Version of UTPM to install (e.g., "0.3.0" or "latest")       | `'latest'`        | No       |
| `token`   | GitHub token for API requests (to avoid rate limiting)         | `${{ github.token }}` | No       |

## Outputs

| Name        | Description                                  |
|-------------|----------------------------------------------|
| `version`   | The installed version of UTPM                |
| `cache-hit` | Whether the installation was restored from cache |

## More Details

For more details, please visit the [GitHub repository](https://github.com/typst-community/utpm) and navigate to [`/docs/ACTION.md`]((https://github.com/typst-community/utpm/docs/)).

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE).


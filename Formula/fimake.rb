class Fimake < Formula
  desc "MCP server that lets AI agents read and edit Figma documents"
  homepage "https://github.com/chavisnguyen/FiMake"
  license "Apache-2.0"

  # NOTE: `url`/`sha256` below are rewritten on every published Release by
  # the "bump-formula" job in .github/workflows/release.yml. Do not edit
  # by hand. (`version` is inferred from the tag in the URL.)
  livecheck do
    url :homepage
    strategy :github_latest
  end

  on_macos do
    on_arm do
      url "https://github.com/chavisnguyen/FiMake/releases/download/v1.0.43/fimake-macos-arm64"
      sha256 "97e0c9203156a25e643876d24efaa7312b1aa37922b0f8701e50fe1eca6e34f6"
    end
    on_intel do
      url "https://github.com/chavisnguyen/FiMake/releases/download/v1.0.43/fimake-macos-x64"
      sha256 "835bbf0927e24e5d2a0912eeb8b59687b4196bf7fd5e3bbafc5a97d6f1a15d9c"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/chavisnguyen/FiMake/releases/download/v1.0.43/fimake-linux-x64"
      sha256 "c45e1b8d91ab42a9fdfb266c525a163c6bc9de8378a69319fcff97741ee85f20"
    end
  end

  resource "manpage" do
    url "https://github.com/chavisnguyen/FiMake/releases/download/v1.0.43/fimake.1"
    sha256 "ba643eca3e9ccfa693478c6c1e78a0c34de3dc8b085cb43b003afcc824057804"
  end

  def install
    asset = if OS.mac?
      Hardware::CPU.arm? ? "fimake-macos-arm64" : "fimake-macos-x64"
    else
      "fimake-linux-x64"
    end
    bin.install asset => "fimake"
    resource("manpage").stage { man1.install "fimake.1" }
  end

  service do
    run [opt_bin/"fimake"]
    environment_variables TRANSPORT: "streamable-http"
    keep_alive true
    log_path var/"log/fimake.log"
    error_log_path var/"log/fimake.log"
  end

  def caveats
    <<~EOS
      Next steps (one-time):
        fimake install-plugin        # register the Figma plugin (macOS)
        fimake service start         # or: brew services start fimake
      Then register http://localhost:10101/mcp via mcps.
      Run `fimake doctor` if anything looks off.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/fimake --version")
    assert_predicate man1/"fimake.1", :exist?
  end
end
